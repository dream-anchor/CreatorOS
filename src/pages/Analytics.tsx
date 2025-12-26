import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  TrendingUp,
  Heart,
  MessageCircle,
  Eye,
  Users,
  BarChart3,
  Loader2,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { de } from "date-fns/locale";

interface AnalyticsData {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalReach: number;
  avgEngagementRate: number;
  topPerformingDay: string | null;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalPosts: 0,
    totalLikes: 0,
    totalComments: 0,
    totalReach: 0,
    avgEngagementRate: 0,
    topPerformingDay: null,
  });

  useEffect(() => {
    if (user) loadAnalytics();
  }, [user]);

  const loadAnalytics = async () => {
    try {
      // Get all published posts
      const { data: posts } = await supabase
        .from("posts")
        .select("*")
        .eq("status", "PUBLISHED")
        .eq("user_id", user?.id);

      if (posts) {
        const totalLikes = posts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
        const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
        const totalReach = posts.reduce((sum, p) => sum + (p.reach_count || 0), 0);
        
        const engagementRates = posts
          .filter(p => p.engagement_rate)
          .map(p => p.engagement_rate || 0);
        const avgEngagementRate = engagementRates.length > 0 
          ? engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length 
          : 0;

        // Find top performing day
        const dayPerformance: Record<string, number> = {};
        posts.forEach(post => {
          if (post.published_at) {
            const day = format(new Date(post.published_at), 'EEEE', { locale: de });
            const engagement = (post.likes_count || 0) + (post.comments_count || 0) * 2;
            dayPerformance[day] = (dayPerformance[day] || 0) + engagement;
          }
        });
        
        const topDay = Object.entries(dayPerformance).sort((a, b) => b[1] - a[1])[0];

        setAnalytics({
          totalPosts: posts.length,
          totalLikes,
          totalComments,
          totalReach,
          avgEngagementRate,
          topPerformingDay: topDay ? topDay[0] : null,
        });
      }
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Analytics">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  const stats = [
    {
      title: "Veröffentlichte Posts",
      value: analytics.totalPosts,
      icon: BarChart3,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Gesamt Likes",
      value: analytics.totalLikes.toLocaleString(),
      icon: Heart,
      color: "text-rose-500",
      bgColor: "bg-rose-500/10",
    },
    {
      title: "Gesamt Kommentare",
      value: analytics.totalComments.toLocaleString(),
      icon: MessageCircle,
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
    },
    {
      title: "Reichweite",
      value: analytics.totalReach.toLocaleString(),
      icon: Eye,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
  ];

  return (
    <AppLayout 
      title="Analytics" 
      description="Überblick über deine Content-Performance"
    >
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="glass-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Insights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Engagement Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-5xl font-bold text-primary">
                  {analytics.avgEngagementRate.toFixed(2)}%
                </p>
                <p className="text-muted-foreground mt-2">
                  Durchschnittliche Engagement Rate
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Bester Tag
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-5xl font-bold text-primary">
                  {analytics.topPerformingDay || "—"}
                </p>
                <p className="text-muted-foreground mt-2">
                  Tag mit dem höchsten Engagement
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Coming Soon */}
        <Card className="glass-card border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Erweiterte Analytics</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Detaillierte Wachstumskurven, Follower-Trends und Performance-Vergleiche 
              werden bald verfügbar sein.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
