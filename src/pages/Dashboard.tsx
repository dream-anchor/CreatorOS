import { useEffect, useState, useRef } from "react";
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
import { RingProgress } from "@/components/dashboard/RingProgress";
import { AgentBriefing } from "@/components/dashboard/AgentBriefing";
import { AgentStatusIndicator } from "@/components/dashboard/AgentStatusIndicator";
import { DashboardChat } from "@/components/dashboard/DashboardChat";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAutopilot, setRunningAutopilot] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string | null } | null>(null);
  const syncAttempted = useRef(false);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  // Smart Sync on mount (only once per session)
  useEffect(() => {
    if (user && !syncAttempted.current && !loading) {
      syncAttempted.current = true;
      runSmartSync();
    }
  }, [user, loading]);

  // Listen for workspace-reset events
  useEffect(() => {
    const handleWorkspaceReset = () => {
      loadData();
    };
    window.addEventListener('workspace-reset', handleWorkspaceReset);
    return () => window.removeEventListener('workspace-reset', handleWorkspaceReset);
  }, []);

  const loadData = async () => {
    try {
      const [postsRes, connRes, settingsRes, profileRes] = await Promise.all([
        supabase.from("posts").select("*").order("created_at", { ascending: false }),
        supabase.from("meta_connections").select("*").maybeSingle(),
        supabase.from("settings").select("*").maybeSingle(),
        supabase.from("profiles").select("display_name").maybeSingle(),
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

  const runSmartSync = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("fetch-instagram-history", {
        body: { mode: 'sync_recent' }
      });
      
      if (error) {
        console.warn('Smart sync failed:', error);
        return;
      }

      if (data?.synced > 0) {
        const { data: postsRes } = await supabase
          .from("posts")
          .select("*")
          .order("created_at", { ascending: false });
        if (postsRes) setPosts(postsRes as Post[]);
      }
    } catch (error) {
      console.warn('Smart sync error:', error);
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
      <div className="flex gap-6 h-full">
        {/* Main Content */}
        <div className="flex-1 space-y-6 min-w-0">
          {/* Header with Agent Status */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
            <AgentStatusIndicator />
          </div>

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

          {/* Agent Briefing Area */}
          <AgentBriefing userName={profile?.display_name || undefined} />

          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Review Card */}
            <Card className="glass-card group hover:border-status-review/50 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <Clock className="h-5 w-5 text-status-review" />
                  <span className="text-2xl font-bold text-foreground">
                    {statusCounts.READY_FOR_REVIEW || 0}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">Zur Prüfung</p>
                <Link 
                  to="/review" 
                  className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                >
                  Review öffnen <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>

            {/* Scheduled Card */}
            <Card className="glass-card group hover:border-status-scheduled/50 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <CalendarDays className="h-5 w-5 text-status-scheduled" />
                  <span className="text-2xl font-bold text-foreground">
                    {statusCounts.SCHEDULED || 0}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">Geplant</p>
                <Link 
                  to="/calendar" 
                  className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                >
                  Kalender <ArrowRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>

            {/* Published Card */}
            <Card className="glass-card group hover:border-status-published/50 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <CheckCircle2 className="h-5 w-5 text-status-published" />
                  <span className="text-2xl font-bold text-foreground">
                    {statusCounts.PUBLISHED || 0}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">Veröffentlicht</p>
                <span className="text-xs text-muted-foreground">Insgesamt</span>
              </CardContent>
            </Card>

            {/* Coverage Card */}
            <Card className="glass-card group hover:border-primary/50 transition-all duration-300">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <RingProgress
                    value={Math.round(coveragePercent)}
                    max={100}
                    size={40}
                    strokeWidth={4}
                    color="hsl(var(--primary))"
                    label="%"
                  />
                </div>
                <p className="text-sm text-muted-foreground mb-2">14-Tage Coverage</p>
                <span className="text-xs text-muted-foreground">
                  {scheduledInNext14Days.length}/{coverageTarget} Posts
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Autopilot Button */}
          <Card 
            className="relative overflow-hidden group cursor-pointer hover:scale-[1.01] transition-all duration-500"
            onClick={!runningAutopilot ? runAutopilot : undefined}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-cyan-500/20 to-violet-500/20 opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 animate-pulse" />
            
            <CardContent className="relative z-10 p-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">🤖 Autopilot</h3>
                <p className="text-sm text-muted-foreground">KI plant automatisch Content für leere Tage</p>
              </div>
              <Button 
                disabled={runningAutopilot}
                className={cn(
                  "h-12 px-6 rounded-xl",
                  "bg-gradient-to-r from-primary via-cyan-500 to-violet-500",
                  "hover:from-primary/90 hover:via-cyan-500/90 hover:to-violet-500/90",
                  "border-2 border-white/20",
                  "shadow-[0_0_30px_rgba(168,85,247,0.3)]"
                )}
              >
                {runningAutopilot ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Generiere...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-5 w-5" />
                    Starten
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Recent Posts */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Letzte Aktivitäten</h2>
              <Link to="/review" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Alle anzeigen →
              </Link>
            </div>
            
            {recentPosts.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="text-center py-8">
                  <Wand2 className="h-8 w-8 text-primary/50 mx-auto mb-3" />
                  <p className="text-muted-foreground mb-3">Noch keine Posts erstellt</p>
                  <Link to="/generator">
                    <Button variant="outline" size="sm" className="glass-button">
                      Ersten Entwurf erstellen
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {recentPosts.map((post) => (
                  <Card
                    key={post.id}
                    className="glass-card group hover:border-primary/30 transition-all duration-300"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground line-clamp-2 mb-1">
                            {post.caption?.slice(0, 60) || "Kein Caption"}
                            {(post.caption?.length || 0) > 60 && "..."}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(post.created_at), "dd. MMM, HH:mm", { locale: de })}
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

        {/* Sidebar Chat - Fixed on the right */}
        <div className="hidden lg:block w-80 xl:w-96 flex-shrink-0">
          <div className="sticky top-4 h-[calc(100vh-8rem)]">
            <DashboardChat className="h-full" />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
