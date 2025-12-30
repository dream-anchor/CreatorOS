import { Card, CardContent } from "@/components/ui/card";
import { 
  Users, 
  Eye, 
  TrendingUp, 
  MousePointerClick,
  UserCheck,
  Activity
} from "lucide-react";

interface DailyStats {
  follower_count: number;
  follower_delta: number;
  reach_day: number;
  impressions_day: number;
  profile_views: number;
  website_clicks: number;
  accounts_engaged: number;
  total_interactions: number;
}

interface StatsOverviewProps {
  todayStats: DailyStats | null;
}

export function StatsOverview({ todayStats }: StatsOverviewProps) {
  const stats = [
    {
      title: "Follower",
      value: todayStats?.follower_count || 0,
      delta: todayStats?.follower_delta || 0,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Reichweite heute",
      value: todayStats?.reach_day || 0,
      icon: Eye,
      color: "text-cyan-500",
      bgColor: "bg-cyan-500/10",
    },
    {
      title: "Impressionen heute",
      value: todayStats?.impressions_day || 0,
      icon: TrendingUp,
      color: "text-violet-500",
      bgColor: "bg-violet-500/10",
    },
    {
      title: "Profilbesuche",
      value: todayStats?.profile_views || 0,
      icon: UserCheck,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Website-Klicks",
      value: todayStats?.website_clicks || 0,
      icon: MousePointerClick,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Interaktionen",
      value: todayStats?.total_interactions || 0,
      icon: Activity,
      color: "text-rose-500",
      bgColor: "bg-rose-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="glass-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-2">
              <div className={`p-1.5 sm:p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${stat.color}`} />
              </div>
              {"delta" in stat && stat.delta !== 0 && (
                <span className={`text-xs font-medium ${stat.delta > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  {stat.delta > 0 ? "+" : ""}{stat.delta}
                </span>
              )}
            </div>
            <p className="text-lg sm:text-xl font-bold">{stat.value.toLocaleString()}</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.title}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
