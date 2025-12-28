import { useEffect, useState } from "react";
import { CoPilotLayout } from "@/components/CoPilotLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Post, Asset } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Calendar as CalendarIcon, Clock, Image as ImageIcon, Recycle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { format, startOfWeek, endOfWeek, addDays, isSameDay } from "date-fns";
import { de } from "date-fns/locale";

export default function CalendarPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<(Post & { assets?: Asset[] })[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) loadPosts();
  }, [user]);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*, assets(*)")
        .in("status", ["APPROVED", "SCHEDULED", "PUBLISHED"])
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      setPosts((data as (Post & { assets?: Asset[] })[]) || []);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  const getPostsForDay = (day: Date) => {
    return posts.filter((post) => {
      if (!post.scheduled_at) return false;
      return isSameDay(new Date(post.scheduled_at), day);
    });
  };

  const getUnscheduledApproved = () => {
    return posts.filter((post) => post.status === "APPROVED" && !post.scheduled_at);
  };

  const openScheduleDialog = (post: Post) => {
    setSelectedPost(post);
    if (post.scheduled_at) {
      const date = new Date(post.scheduled_at);
      setScheduleDate(format(date, "yyyy-MM-dd"));
      setScheduleTime(format(date, "HH:mm"));
    } else {
      setScheduleDate(format(new Date(), "yyyy-MM-dd"));
      setScheduleTime("12:00");
    }
    setDialogOpen(true);
  };

  const handleSchedule = async () => {
    if (!selectedPost || !scheduleDate || !scheduleTime) return;

    setSaving(true);
    try {
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);

      const { error } = await supabase
        .from("posts")
        .update({
          status: "SCHEDULED",
          scheduled_at: scheduledAt.toISOString(),
        })
        .eq("id", selectedPost.id);

      if (error) throw error;

      await supabase.from("logs").insert({
        user_id: user!.id,
        post_id: selectedPost.id,
        event_type: "post_scheduled",
        level: "info",
        details: { scheduled_at: scheduledAt.toISOString() },
      });

      toast.success("Post geplant!");
      setDialogOpen(false);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnschedule = async () => {
    if (!selectedPost) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("posts")
        .update({
          status: "APPROVED",
          scheduled_at: null,
        })
        .eq("id", selectedPost.id);

      if (error) throw error;

      toast.success("Planung aufgehoben");
      setDialogOpen(false);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <CoPilotLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </CoPilotLayout>
    );
  }

  return (
    <CoPilotLayout>
      <div className="p-6">
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Unscheduled Posts */}
        <div className="lg:col-span-1">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Bereit zur Planung
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {getUnscheduledApproved().length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Keine genehmigten Posts
                </p>
              ) : (
                getUnscheduledApproved().map((post) => (
                  <div
                    key={post.id}
                    onClick={() => openScheduleDialog(post)}
                    className="p-3 rounded-lg border border-border hover:border-primary/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={post.status} />
                      {post.remixed_from_id && (
                        <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                          <Recycle className="h-3 w-3 mr-1" />
                          Remix
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm mt-2 line-clamp-2">{post.caption}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Week Calendar */}
        <div className="lg:col-span-3">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                {format(currentWeekStart, "d. MMMM", { locale: de })} -{" "}
                {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), "d. MMMM yyyy", {
                  locale: de,
                })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day) => {
                  const dayPosts = getPostsForDay(day);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-[200px] p-2 rounded-lg border ${
                        isToday ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="text-center mb-2">
                        <p className="text-xs text-muted-foreground">
                          {format(day, "EEE", { locale: de })}
                        </p>
                        <p
                          className={`text-lg font-semibold ${
                            isToday ? "text-primary" : ""
                          }`}
                        >
                          {format(day, "d")}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {dayPosts.map((post) => (
                          <div
                            key={post.id}
                            onClick={() => openScheduleDialog(post)}
                            className="p-2 rounded bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-1 mb-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {post.scheduled_at &&
                                  format(new Date(post.scheduled_at), "HH:mm")}
                              </span>
                              {post.remixed_from_id && (
                                <span className="text-xs bg-amber-500/20 text-amber-600 px-1 rounded">
                                  ♻️
                                </span>
                              )}
                            </div>
                            <StatusBadge status={post.status} className="mb-1" />
                            <p className="text-xs line-clamp-2">{post.caption}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post planen</DialogTitle>
          </DialogHeader>

          {selectedPost && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <StatusBadge status={selectedPost.status} />
                <p className="text-sm mt-2 line-clamp-3">{selectedPost.caption}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Datum</Label>
                  <Input
                    id="date"
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Uhrzeit</Label>
                  <Input
                    id="time"
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                {selectedPost.status === "SCHEDULED" && (
                  <Button
                    variant="outline"
                    onClick={handleUnschedule}
                    disabled={saving}
                    className="flex-1"
                  >
                    Planung aufheben
                  </Button>
                )}
                <Button onClick={handleSchedule} disabled={saving} className="flex-1">
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {selectedPost.status === "SCHEDULED" ? "Aktualisieren" : "Planen"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </CoPilotLayout>
  );
}
