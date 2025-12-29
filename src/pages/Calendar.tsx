import { useEffect, useState, useRef } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Post, Asset } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Calendar as CalendarIcon, Clock, Recycle, X, Plus } from "lucide-react";
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
  const [selectedPost, setSelectedPost] = useState<(Post & { assets?: Asset[] }) | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [editCaption, setEditCaption] = useState("");
  const [postAssets, setPostAssets] = useState<Asset[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const openScheduleDialog = (post: Post & { assets?: Asset[] }) => {
    setSelectedPost(post);
    setEditCaption(post.caption || "");
    setPostAssets(post.assets || []);
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

  const handleDeleteAsset = async (asset: Asset) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("post-assets")
        .remove([asset.storage_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("assets")
        .delete()
        .eq("id", asset.id);

      if (dbError) throw dbError;

      setPostAssets((prev) => prev.filter((a) => a.id !== asset.id));
      toast.success("Bild gelöscht");
    } catch (error: any) {
      toast.error("Fehler beim Löschen: " + error.message);
    }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPost || !user) return;

    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${selectedPost.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("post-assets")
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("post-assets")
        .getPublicUrl(path);

      const { data: newAsset, error: dbError } = await supabase
        .from("assets")
        .insert({
          user_id: user.id,
          post_id: selectedPost.id,
          storage_path: path,
          public_url: urlData.publicUrl,
          source: "upload",
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setPostAssets((prev) => [...prev, newAsset as Asset]);
      toast.success("Bild hinzugefügt");
    } catch (error: any) {
      toast.error("Fehler beim Hochladen: " + error.message);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
          caption: editCaption,
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
      <GlobalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </GlobalLayout>
    );
  }

  return (
    <GlobalLayout>
      <div className="p-4 sm:p-6">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-4">
        {/* Unscheduled Posts */}
        <div className="lg:col-span-1 order-2 lg:order-1">
          <Card className="glass-card">
            <CardHeader className="pb-3">
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
        <div className="lg:col-span-3 order-1 lg:order-2">
          <Card className="glass-card">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="truncate">
                  {format(currentWeekStart, "d. MMM", { locale: de })} -{" "}
                  {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), "d. MMM yyyy", {
                    locale: de,
                  })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="grid grid-cols-7 gap-1 sm:gap-2 min-w-[500px]">
                {weekDays.map((day) => {
                  const dayPosts = getPostsForDay(day);
                  const isToday = isSameDay(day, new Date());

                  return (
                    <div
                      key={day.toISOString()}
                      className={`min-h-[140px] sm:min-h-[200px] p-1.5 sm:p-2 rounded-lg border ${
                        isToday ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div className="text-center mb-1 sm:mb-2">
                        <p className="text-[10px] sm:text-xs text-muted-foreground">
                          {format(day, "EEE", { locale: de })}
                        </p>
                        <p
                          className={`text-sm sm:text-lg font-semibold ${
                            isToday ? "text-primary" : ""
                          }`}
                        >
                          {format(day, "d")}
                        </p>
                      </div>
                      <div className="space-y-1 sm:space-y-2">
                        {dayPosts.map((post) => (
                          <div
                            key={post.id}
                            onClick={() => openScheduleDialog(post)}
                            className="p-1.5 sm:p-2 rounded bg-muted hover:bg-muted/80 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-1 mb-1">
                              <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground" />
                              <span className="text-[10px] sm:text-xs text-muted-foreground">
                                {post.scheduled_at &&
                                  format(new Date(post.scheduled_at), "HH:mm")}
                              </span>
                              {post.remixed_from_id && (
                                <span className="text-[10px] sm:text-xs bg-amber-500/20 text-amber-600 px-1 rounded">
                                  ♻️
                                </span>
                              )}
                            </div>
                            <StatusBadge status={post.status} className="mb-1 text-[10px]" />
                            <p className="text-[10px] sm:text-xs line-clamp-2">{post.caption}</p>
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
              {/* Images Section */}
              <div className="space-y-2">
                <Label>Bilder</Label>
                <div className="flex flex-wrap gap-2">
                  {postAssets.map((asset) => (
                    <div key={asset.id} className="relative group">
                      <img
                        src={asset.public_url || ""}
                        alt=""
                        className="w-20 h-20 object-cover rounded-lg border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteAsset(asset)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="w-20 h-20 border-2 border-dashed border-border rounded-lg flex items-center justify-center hover:border-primary/50 transition-colors"
                  >
                    {uploadingImage ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <Plus className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAddImage}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Caption */}
              <div className="space-y-2">
                <StatusBadge status={selectedPost.status} />
                <Label htmlFor="caption">Caption</Label>
                <Textarea
                  id="caption"
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  rows={5}
                  className="resize-none"
                />
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
    </GlobalLayout>
  );
}
