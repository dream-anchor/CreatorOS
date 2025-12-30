import { useEffect, useState, useMemo } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, BarChart3, AlertCircle } from "lucide-react";
import { subDays, format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

import { FollowerChart } from "@/components/analytics/FollowerChart";
import { ReachChart } from "@/components/analytics/ReachChart";
import { EngagementChart } from "@/components/analytics/EngagementChart";
import { StatsOverview } from "@/components/analytics/StatsOverview";
import { DateRangeSelector } from "@/components/analytics/DateRangeSelector";

interface DailyStats {
  id: string;
  date: string;
  follower_count: number;
  follower_delta: number;
  impressions_day: number;
  reach_day: number;
  profile_views: number;
  website_clicks: number;
  email_contacts: number;
  accounts_engaged: number;
  total_interactions: number;
  likes_day: number;
  comments_day: number;
  shares_day: number;
  saves_day: number;
  posts_count: number;
  updated_at: string;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dailyStats, setDailyStats] = useState<DailyStats[]>([]);
  const [selectedRange, setSelectedRange] = useState<"7" | "30" | "90">("30");
  const [hasConnection, setHasConnection] = useState(true);

  useEffect(() => {
    if (user) {
      loadStats();
      checkConnection();
    }
  }, [user, selectedRange]);

  const checkConnection = async () => {
    const { data } = await supabase
      .from("meta_connections")
      .select("id")
      .eq("user_id", user?.id)
      .maybeSingle();
    setHasConnection(!!data);
  };

  const loadStats = async () => {
    try {
      const startDate = subDays(new Date(), parseInt(selectedRange));
      
      const { data, error } = await supabase
        .from("daily_account_stats")
        .select("*")
        .eq("user_id", user?.id)
        .gte("date", format(startDate, "yyyy-MM-dd"))
        .order("date", { ascending: true });

      if (error) throw error;
      setDailyStats(data || []);
    } catch (error) {
      console.error("Error loading stats:", error);
      toast.error("Fehler beim Laden der Analytics");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("fetch-daily-insights", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success("Analytics erfolgreich synchronisiert!");
      await loadStats();
    } catch (error) {
      console.error("Sync error:", error);
      toast.error("Fehler beim Synchronisieren der Analytics");
    } finally {
      setSyncing(false);
    }
  };

  const todayStats = useMemo(() => {
    if (dailyStats.length === 0) return null;
    return dailyStats[dailyStats.length - 1];
  }, [dailyStats]);

  const lastSyncDate = useMemo(() => {
    if (!todayStats) return null;
    // Use updated_at for accurate sync timestamp, fallback to date
    return todayStats.updated_at || todayStats.date;
  }, [todayStats]);

  if (loading) {
    return (
      <GlobalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </GlobalLayout>
    );
  }

  if (!hasConnection) {
    return (
      <GlobalLayout>
        <div className="p-4 sm:p-6 lg:p-8">
          <Card className="glass-card border-dashed max-w-2xl mx-auto">
            <CardContent className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4">
                <AlertCircle className="h-8 w-8 text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Instagram nicht verbunden</h3>
              <p className="text-muted-foreground text-sm max-w-md mb-4">
                Um Analytics zu sehen, verbinde zuerst deinen Instagram Business Account 
                in den Einstellungen.
              </p>
            </CardContent>
          </Card>
        </div>
      </GlobalLayout>
    );
  }

  return (
    <GlobalLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="space-y-6 max-w-7xl">
          {/* Header with Date Range and Sync */}
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Analytics</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Dein Instagram-Wachstum im Überblick
              </p>
            </div>
            <DateRangeSelector
              selectedRange={selectedRange}
              onRangeChange={setSelectedRange}
              onSync={handleSync}
              isSyncing={syncing}
              lastSyncDate={lastSyncDate}
            />
          </div>

          {dailyStats.length === 0 ? (
            <Card className="glass-card border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <BarChart3 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Noch keine Daten vorhanden</h3>
                <p className="text-muted-foreground text-sm max-w-md mb-4">
                  Klicke auf "Jetzt synchronisieren" um deine Instagram-Statistiken 
                  abzurufen. Danach werden die Daten täglich automatisch aktualisiert.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Today's Stats Overview */}
              <StatsOverview todayStats={todayStats} />

              {/* Charts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <FollowerChart data={dailyStats} />
                <ReachChart data={dailyStats} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:gap-6">
                <EngagementChart data={dailyStats} />
              </div>

              {/* Coming Soon */}
              <Card className="glass-card border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-10 sm:py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-3">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold mb-2">Erweiterte Analytics</h3>
                  <p className="text-muted-foreground text-center text-xs sm:text-sm max-w-md">
                    Post-Performance-Vergleiche, beste Posting-Zeiten und KI-gestützte 
                    Wachstumsempfehlungen werden bald verfügbar sein.
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </GlobalLayout>
  );
}
