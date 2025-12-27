import { useEffect, useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Post, MetaConnection, Settings } from "@/types/database";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  Instagram,
  Loader2,
  Wand2,
  MessageCircle,
} from "lucide-react";
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
  const [showMobileChat, setShowMobileChat] = useState(false);
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
          <div className="flex items-center justify-between flex-wrap gap-4">
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

          {/* Hero: Agent Briefing Area */}
          <AgentBriefing userName={profile?.display_name || undefined} />

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
        </div>

        {/* Sidebar Chat - Fixed on the right (Desktop) */}
        <div className="hidden lg:block w-80 xl:w-96 flex-shrink-0">
          <div className="sticky top-4 h-[calc(100vh-8rem)]">
            <DashboardChat className="h-full" />
          </div>
        </div>
      </div>

      {/* Mobile Chat Button */}
      <div className="lg:hidden fixed bottom-6 right-6 z-50">
        <Button
          size="lg"
          onClick={() => setShowMobileChat(true)}
          className={cn(
            "h-16 w-16 rounded-2xl shadow-2xl",
            "bg-gradient-to-br from-primary to-cyan-500",
            "hover:from-primary/90 hover:to-cyan-500/90",
            "flex flex-col items-center justify-center gap-0.5",
            "animate-pulse"
          )}
          style={{ animationDuration: '3s' }}
        >
          <MessageCircle className="h-6 w-6" />
          <span className="text-[10px] font-medium">Frag mich</span>
        </Button>
      </div>

      {/* Mobile Chat Modal */}
      {showMobileChat && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background/95 backdrop-blur-lg">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-bold text-lg">Co-Pilot Chat</h2>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowMobileChat(false)}
              >
                Schließen
              </Button>
            </div>
            <div className="flex-1 min-h-0">
              <DashboardChat className="h-full rounded-none border-0" />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}