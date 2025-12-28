import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { 
  MessageCircle, 
  CalendarClock, 
  Sparkles, 
  BarChart3,
  ArrowRight
} from "lucide-react";
import { Link } from "react-router-dom";

export function WelcomeStage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [stats, setStats] = useState({
    pendingComments: 0,
    scheduledPosts: 0,
    draftPosts: 0
  });

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;

    const [profileRes, commentsRes, postsRes] = await Promise.all([
      supabase.from("profiles").select("display_name").maybeSingle(),
      supabase.from("instagram_comments").select("id", { count: "exact", head: true }).eq("is_replied", false),
      supabase.from("posts").select("id, status")
    ]);

    if (profileRes.data) {
      setDisplayName(profileRes.data.display_name);
    }

    const posts = postsRes.data || [];
    setStats({
      pendingComments: commentsRes.count || 0,
      scheduledPosts: posts.filter(p => p.status === "SCHEDULED").length,
      draftPosts: posts.filter(p => p.status === "DRAFT" || p.status === "IDEA").length
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Guten Morgen";
    if (hour < 18) return "Guten Tag";
    return "Guten Abend";
  };

  const firstName = displayName?.split(" ")[0] || "Creator";

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Greeting */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground">
            {getGreeting()}, {firstName}. 👋
          </h1>
          <p className="text-xl text-muted-foreground">
            Ich bin bereit. Was steht an?
          </p>
        </div>

        {/* Quick Stats */}
        {(stats.pendingComments > 0 || stats.scheduledPosts > 0 || stats.draftPosts > 0) && (
          <div className="flex justify-center gap-4 text-sm text-muted-foreground">
            {stats.pendingComments > 0 && (
              <span className="flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4 text-primary" />
                {stats.pendingComments} offene Kommentare
              </span>
            )}
            {stats.scheduledPosts > 0 && (
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-cyan-500" />
                {stats.scheduledPosts} geplante Posts
              </span>
            )}
          </div>
        )}

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link to="/community">
            <Card className="p-6 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                    <MessageCircle className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-foreground">Kommentare checken</h3>
                    <p className="text-sm text-muted-foreground">
                      {stats.pendingComments > 0 ? `${stats.pendingComments} warten` : "Alles beantwortet"}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Card>
          </Link>

          <Link to="/calendar">
            <Card className="p-6 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/10 flex items-center justify-center">
                    <CalendarClock className="h-6 w-6 text-cyan-500" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-foreground">Post planen</h3>
                    <p className="text-sm text-muted-foreground">
                      {stats.scheduledPosts > 0 ? `${stats.scheduledPosts} in der Pipeline` : "Kalender öffnen"}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-cyan-500 transition-colors" />
              </div>
            </Card>
          </Link>

          <Link to="/generator">
            <Card className="p-6 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/10 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-violet-500" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-foreground">Content erstellen</h3>
                    <p className="text-sm text-muted-foreground">Mit AI generieren</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-violet-500 transition-colors" />
              </div>
            </Card>
          </Link>

          <Link to="/analytics">
            <Card className="p-6 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-semibold text-foreground">Performance</h3>
                    <p className="text-sm text-muted-foreground">Statistiken ansehen</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
              </div>
            </Card>
          </Link>
        </div>

        {/* Hint */}
        <p className="text-sm text-muted-foreground">
          💡 Tipp: Nutze den Co-Pilot rechts um per Chat zu navigieren
        </p>
      </div>
    </div>
  );
}
