import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Post, MetaConnection, Settings, PostStatus } from "@/types/database";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  Clock,
  Instagram,
  Loader2,
  Wand2,
  CalendarDays,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { GreetingHeader } from "@/components/dashboard/GreetingHeader";
import { GenerateButton } from "@/components/dashboard/GenerateButton";
import { RingProgress } from "@/components/dashboard/RingProgress";
import { WaveAnimation } from "@/components/dashboard/WaveAnimation";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAutopilot, setRunningAutopilot] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [postsRes, connRes, settingsRes, profileRes] = await Promise.all([
        supabase.from("posts").select("*").order("created_at", { ascending: false }),
        supabase.from("meta_connections").select("*").single(),
        supabase.from("settings").select("*").single(),
        supabase.from("profiles").select("display_name").single(),
      ]);

      if (postsRes.data) setPosts(postsRes.data as Post[]);
      if (connRes.data) setConnection(connRes.data as MetaConnection);
      if (settingsRes.data) setSettings(settingsRes.data as Settings);
      if (profileRes.data) setProfile(profileRes.data);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const runAutopilot = async () => {
    setRunningAutopilot(true);
    try {
      const { data, error } = await supabase.functions.invoke("autopilot-fill");
      if (error) throw error;
      toast.success(`${data?.draftsCreated || 0} Entwürfe erstellt`);
      loadData();
    } catch (error: any) {
      toast.error("Autopilot fehlgeschlagen: " + error.message);
    } finally {
      setRunningAutopilot(false);
    }
  };

  // Calculate stats
  const statusCounts = posts.reduce((acc, post) => {
    acc[post.status] = (acc[post.status] || 0) + 1;
    return acc;
  }, {} as Record<PostStatus, number>);

  // Calculate 14-day coverage
  const scheduledInNext14Days = posts.filter((post) => {
    if (!post.scheduled_at) return false;
    const scheduledDate = new Date(post.scheduled_at);
    return (
      scheduledDate >= startOfDay(new Date()) &&
      scheduledDate <= endOfDay(addDays(new Date(), 13))
    );
  });

  const coverageTarget = (settings?.posts_per_week || 2) * 2;
  const coveragePercent = Math.min(100, (scheduledInNext14Days.length / coverageTarget) * 100);
  const recentPosts = posts.slice(0, 4);

  if (loading) {
    return (
      <AppLayout title="Dashboard" description="">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="" description="">
      <div className="space-y-8">
        {/* Greeting Header */}
        <GreetingHeader userName={profile?.display_name || undefined} />

        {/* Connection Warning */}
        {!connection?.ig_user_id && (
          <Card className="border-warning/50 bg-warning/10 backdrop-blur-xl">
            <CardContent className="flex items-center gap-4 py-4">
              <AlertCircle className="h-5 w-5 text-warning" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Instagram nicht verbunden</p>
                <p className="text-sm text-muted-foreground">
                  Verbinde dein Instagram-Konto, um Posts zu veröffentlichen.
                </p>
              </div>
              <Link to="/settings/meta">
                <Button variant="outline" size="sm" className="glass-button">
                  <Instagram className="mr-2 h-4 w-4" />
                  Verbinden
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-fr">
          
          {/* Generate Button - Large */}
          <div className="md:col-span-2 lg:col-span-2 lg:row-span-2">
            <GenerateButton />
          </div>

          {/* Review Card */}
          <Card className="glass-card group hover:border-status-review/50 transition-all duration-300">
            <CardContent className="p-6 h-full flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Zur Prüfung</p>
                  <div className="flex items-center gap-3">
                    <RingProgress
                      value={statusCounts.READY_FOR_REVIEW || 0}
                      max={Math.max(5, statusCounts.READY_FOR_REVIEW || 0)}
                      size={60}
                      strokeWidth={6}
                      color="hsl(var(--status-review))"
                    />
                    <WaveAnimation color="violet" />
                  </div>
                </div>
                <Clock className="h-5 w-5 text-status-review" />
              </div>
              <Link 
                to="/review" 
                className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group-hover:text-primary"
              >
                Review öffnen <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </CardContent>
          </Card>

          {/* Scheduled Card */}
          <Card className="glass-card group hover:border-status-scheduled/50 transition-all duration-300">
            <CardContent className="p-6 h-full flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Geplant</p>
                  <div className="flex items-center gap-3">
                    <RingProgress
                      value={statusCounts.SCHEDULED || 0}
                      max={Math.max(5, statusCounts.SCHEDULED || 0)}
                      size={60}
                      strokeWidth={6}
                      color="hsl(var(--status-scheduled))"
                    />
                    <WaveAnimation color="cyan" />
                  </div>
                </div>
                <CalendarDays className="h-5 w-5 text-status-scheduled" />
              </div>
              <Link 
                to="/calendar" 
                className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group-hover:text-primary"
              >
                Kalender öffnen <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </CardContent>
          </Card>

          {/* Published Card */}
          <Card className="glass-card group hover:border-status-published/50 transition-all duration-300">
            <CardContent className="p-6 h-full flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Veröffentlicht</p>
                  <div className="flex items-center gap-3">
                    <RingProgress
                      value={statusCounts.PUBLISHED || 0}
                      max={Math.max(10, statusCounts.PUBLISHED || 0)}
                      size={60}
                      strokeWidth={6}
                      color="hsl(var(--status-published))"
                    />
                    <WaveAnimation color="emerald" />
                  </div>
                </div>
                <CheckCircle2 className="h-5 w-5 text-status-published" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">Insgesamt</p>
            </CardContent>
          </Card>

          {/* Coverage Card */}
          <Card className="glass-card group hover:border-primary/50 transition-all duration-300">
            <CardContent className="p-6 h-full flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">14-Tage Coverage</p>
                  <RingProgress
                    value={Math.round(coveragePercent)}
                    max={100}
                    size={60}
                    strokeWidth={6}
                    color="hsl(var(--primary))"
                    label="%"
                  />
                </div>
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {scheduledInNext14Days.length}/{coverageTarget} Posts
              </p>
            </CardContent>
          </Card>

          {/* Autopilot Card */}
          <Card className="md:col-span-2 lg:col-span-2 glass-card hover:border-primary/30 transition-all duration-300">
            <CardContent className="p-6 h-full flex items-center gap-6">
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">Autopilot</h3>
                <p className="text-sm text-muted-foreground">
                  Lass die KI automatisch Entwürfe basierend auf deinen Themen erstellen.
                </p>
              </div>
              <Button 
                onClick={runAutopilot} 
                disabled={runningAutopilot}
                className={cn(
                  "shrink-0 h-12 px-6 rounded-2xl",
                  "bg-gradient-to-r from-primary/80 to-cyan-500/80",
                  "hover:from-primary hover:to-cyan-500",
                  "border border-primary/50 hover:border-primary",
                  "shadow-lg hover:shadow-primary/25",
                  "transition-all duration-300"
                )}
              >
                {runningAutopilot ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Autopilot starten
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Posts */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-foreground">Letzte Aktivitäten</h2>
            <Link to="/review" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              Alle anzeigen →
            </Link>
          </div>
          
          {recentPosts.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Wand2 className="h-8 w-8 text-primary/50" />
                </div>
                <p className="text-muted-foreground mb-4">Noch keine Posts erstellt</p>
                <Link to="/generator">
                  <Button variant="outline" className="glass-button">
                    Ersten Entwurf erstellen
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentPosts.map((post) => (
                <Card
                  key={post.id}
                  className="glass-card group hover:border-primary/30 transition-all duration-300"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-foreground line-clamp-2 mb-2">
                          {post.caption?.slice(0, 80) || "Kein Caption"}
                          {(post.caption?.length || 0) > 80 && "..."}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(post.created_at), "dd. MMM yyyy, HH:mm", {
                            locale: de,
                          })}
                        </p>
                      </div>
                      <StatusBadge status={post.status} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
