import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Post, MetaConnection, Settings, PostStatus } from "@/types/database";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Sparkles,
  Calendar,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Clock,
  Instagram,
  Loader2,
  Wand2,
  CalendarDays,
} from "lucide-react";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { de } from "date-fns/locale";

export default function DashboardPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningAutopilot, setRunningAutopilot] = useState(false);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      const [postsRes, connRes, settingsRes] = await Promise.all([
        supabase.from("posts").select("*").order("created_at", { ascending: false }),
        supabase.from("meta_connections").select("*").single(),
        supabase.from("settings").select("*").single(),
      ]);

      if (postsRes.data) setPosts(postsRes.data as Post[]);
      if (connRes.data) setConnection(connRes.data as MetaConnection);
      if (settingsRes.data) setSettings(settingsRes.data as Settings);
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
  const next14Days = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i));
  const scheduledInNext14Days = posts.filter((post) => {
    if (!post.scheduled_at) return false;
    const scheduledDate = new Date(post.scheduled_at);
    return (
      scheduledDate >= startOfDay(new Date()) &&
      scheduledDate <= endOfDay(addDays(new Date(), 13))
    );
  });

  const coverageTarget = (settings?.posts_per_week || 2) * 2; // 2 weeks
  const coveragePercent = Math.min(100, (scheduledInNext14Days.length / coverageTarget) * 100);

  const recentPosts = posts.slice(0, 5);

  if (loading) {
    return (
      <AppLayout title="Dashboard" description="Übersicht deiner Instagram-Automatisierung">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Dashboard"
      description="Übersicht deiner Instagram-Automatisierung"
      actions={
        <div className="flex gap-3">
          <Button variant="outline" onClick={runAutopilot} disabled={runningAutopilot}>
            {runningAutopilot ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            Autopilot füllen
          </Button>
          <Link to="/generator">
            <Button>
              <Sparkles className="mr-2 h-4 w-4" />
              Neuer Entwurf
            </Button>
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Connection Status */}
        {!connection?.ig_user_id && (
          <Card className="border-warning/50 bg-warning/5">
            <CardContent className="flex items-center gap-4 py-4">
              <AlertCircle className="h-5 w-5 text-warning" />
              <div className="flex-1">
                <p className="font-medium text-foreground">Instagram nicht verbunden</p>
                <p className="text-sm text-muted-foreground">
                  Verbinde dein Instagram-Konto, um Posts zu veröffentlichen.
                </p>
              </div>
              <Link to="/settings/meta">
                <Button variant="outline" size="sm">
                  <Instagram className="mr-2 h-4 w-4" />
                  Verbinden
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Zur Prüfung
              </CardTitle>
              <Clock className="h-4 w-4 text-status-review" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statusCounts.READY_FOR_REVIEW || 0}
              </div>
              <Link to="/review" className="text-xs text-muted-foreground hover:text-primary">
                Review öffnen →
              </Link>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Geplant
              </CardTitle>
              <CalendarDays className="h-4 w-4 text-status-scheduled" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statusCounts.SCHEDULED || 0}</div>
              <Link to="/calendar" className="text-xs text-muted-foreground hover:text-primary">
                Kalender öffnen →
              </Link>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Veröffentlicht
              </CardTitle>
              <CheckCircle2 className="h-4 w-4 text-status-published" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statusCounts.PUBLISHED || 0}</div>
              <p className="text-xs text-muted-foreground">Insgesamt</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                14-Tage Coverage
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(coveragePercent)}%</div>
              <div className="mt-2 h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {scheduledInNext14Days.length}/{coverageTarget} Posts geplant
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Posts */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg">Letzte Posts</CardTitle>
          </CardHeader>
          <CardContent>
            {recentPosts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Noch keine Posts erstellt</p>
                <Link to="/generator">
                  <Button variant="link" className="mt-2">
                    Ersten Entwurf erstellen
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">
                        {post.caption?.slice(0, 60) || "Kein Caption"}
                        {(post.caption?.length || 0) > 60 && "..."}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(post.created_at), "dd. MMM yyyy, HH:mm", {
                          locale: de,
                        })}
                      </p>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
