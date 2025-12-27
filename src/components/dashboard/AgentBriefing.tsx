import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { 
  MessageCircle, 
  Sparkles,
  CalendarPlus,
  TrendingUp,
  Loader2,
  Bot
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays, startOfDay, endOfDay } from "date-fns";
import { de } from "date-fns/locale";

interface AgentBriefingProps {
  userName?: string;
}

interface BriefingData {
  queueCount: number;
  scheduledCount: number;
  pendingReviewCount: number;
  nextGap: Date | null;
  nextGapDay: string | null;
}

export function AgentBriefing({ userName }: AgentBriefingProps) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBriefingData();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('briefing-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comment_reply_queue' },
        () => loadBriefingData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => loadBriefingData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadBriefingData = async () => {
    try {
      const [queueRes, postsRes] = await Promise.all([
        supabase
          .from("comment_reply_queue")
          .select("id", { count: "exact" })
          .in("status", ["pending", "waiting_for_post"]),
        supabase
          .from("posts")
          .select("status, scheduled_at"),
      ]);

      const posts = postsRes.data || [];
      const scheduledCount = posts.filter(p => p.status === "SCHEDULED").length;
      const pendingReviewCount = posts.filter(p => p.status === "READY_FOR_REVIEW").length;

      // Find next gap in the next 14 days
      const scheduledDates = posts
        .filter(p => p.scheduled_at)
        .map(p => startOfDay(new Date(p.scheduled_at!)).getTime());

      let nextGap: Date | null = null;
      let nextGapDay: string | null = null;
      
      for (let i = 1; i <= 14; i++) {
        const checkDate = startOfDay(addDays(new Date(), i));
        if (!scheduledDates.includes(checkDate.getTime())) {
          nextGap = checkDate;
          nextGapDay = format(checkDate, "EEEE", { locale: de });
          break;
        }
      }

      setBriefing({
        queueCount: queueRes.count || 0,
        scheduledCount,
        pendingReviewCount,
        nextGap,
        nextGapDay,
      });
    } catch (error) {
      console.error("Error loading briefing:", error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Guten Morgen";
    if (hour < 18) return "Hallo";
    return "Guten Abend";
  };

  const getBriefingMessage = () => {
    if (!briefing) return "Lade Daten...";

    const parts: string[] = [];
    
    // Status message
    if (briefing.queueCount > 0) {
      parts.push(`${briefing.queueCount} Fan-Antwort${briefing.queueCount !== 1 ? "en" : ""} warten auf deine Freigabe für das Golden Window heute Abend`);
    }
    
    if (briefing.pendingReviewCount > 0) {
      parts.push(`${briefing.pendingReviewCount} Post${briefing.pendingReviewCount !== 1 ? "s" : ""} ${briefing.pendingReviewCount !== 1 ? "sind" : "ist"} bereit für dein Review`);
    }

    if (briefing.nextGapDay) {
      parts.push(`ich habe eine Idee für die Lücke am ${briefing.nextGapDay}`);
    }

    if (parts.length === 0) {
      return "Alles läuft nach Plan! Dein Content-Kalender ist gut gefüllt und alle Antworten sind raus. Womit wollen wir weitermachen?";
    }

    // Build natural sentence
    if (parts.length === 1) {
      return `Ich halte die Stellung. Aktuell ${parts[0]}. Womit wollen wir starten?`;
    }

    const lastPart = parts.pop();
    return `Ich halte die Stellung. Aktuell ${parts.join(", ")}. Außerdem habe ${lastPart}. Womit wollen wir starten?`;
  };

  if (loading) {
    return (
      <Card className="border-primary/30 bg-gradient-to-br from-card via-card to-primary/5">
        <CardContent className="p-8 flex items-center justify-center min-h-[240px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 relative overflow-hidden">
      {/* Animated background glow */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      
      <CardContent className="relative z-10 p-8 space-y-6">
        {/* Header with greeting */}
        <div className="flex items-start gap-5">
          {/* Bot Avatar */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-primary to-cyan-500 flex items-center justify-center shadow-xl shadow-primary/30">
                <Bot className="h-8 w-8 text-white" />
              </div>
              {/* Pulse ring */}
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 opacity-30 animate-ping" style={{ animationDuration: '3s' }} />
            </div>
          </div>
          
          {/* Speech bubble */}
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold text-foreground">
                {getGreeting()}{userName ? `, ${userName}` : ""}! 👋
              </span>
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2" />
                Co-Pilot aktiv
              </Badge>
            </div>
            
            <div className="bg-muted/60 backdrop-blur-sm rounded-2xl rounded-tl-md p-5 border border-border/50">
              <p className="text-foreground/90 leading-relaxed text-base">
                {getBriefingMessage()}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Reply Queue Action */}
          {briefing && briefing.queueCount > 0 && (
            <Link to="/community" className="block">
              <Card className={cn(
                "h-full cursor-pointer transition-all duration-300",
                "border-primary/30 hover:border-primary hover:shadow-lg hover:shadow-primary/10",
                "bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/15 hover:to-primary/10",
                "hover:scale-[1.02]"
              )}>
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <MessageCircle className="h-6 w-6 text-primary" />
                    <Badge className="bg-primary/20 text-primary border-primary/30 text-lg px-3">
                      {briefing.queueCount}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">Antworten prüfen</h3>
                  <p className="text-sm text-muted-foreground">
                    Fan-Antworten warten auf Freigabe
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Review Posts Action */}
          {briefing && briefing.pendingReviewCount > 0 && (
            <Link to="/review" className="block">
              <Card className={cn(
                "h-full cursor-pointer transition-all duration-300",
                "border-amber-500/30 hover:border-amber-500 hover:shadow-lg hover:shadow-amber-500/10",
                "bg-gradient-to-br from-amber-500/10 to-amber-500/5 hover:from-amber-500/15 hover:to-amber-500/10",
                "hover:scale-[1.02]"
              )}>
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <Sparkles className="h-6 w-6 text-amber-500" />
                    <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-lg px-3">
                      {briefing.pendingReviewCount}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">Posts reviewen</h3>
                  <p className="text-sm text-muted-foreground">
                    Entwürfe bereit zur Prüfung
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Fill Gap Action */}
          {briefing && briefing.nextGapDay && (
            <Link to="/generator" className="block">
              <Card className={cn(
                "h-full cursor-pointer transition-all duration-300",
                "border-cyan-500/30 hover:border-cyan-500 hover:shadow-lg hover:shadow-cyan-500/10",
                "bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 hover:from-cyan-500/15 hover:to-cyan-500/10",
                "hover:scale-[1.02]"
              )}>
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="flex items-center justify-between mb-3">
                    <CalendarPlus className="h-6 w-6 text-cyan-500" />
                    <span className="text-sm font-medium text-cyan-500 bg-cyan-500/15 px-2 py-1 rounded-full">
                      {briefing.nextGapDay}
                    </span>
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">Lücke füllen</h3>
                  <p className="text-sm text-muted-foreground">
                    Neuen Content für {briefing.nextGapDay} erstellen
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Analytics Action - show if less than 3 actions */}
          {briefing && (
            (briefing.queueCount === 0 || briefing.pendingReviewCount === 0 || !briefing.nextGapDay) && (
              <Link to="/analytics" className="block">
                <Card className={cn(
                  "h-full cursor-pointer transition-all duration-300",
                  "border-violet-500/30 hover:border-violet-500 hover:shadow-lg hover:shadow-violet-500/10",
                  "bg-gradient-to-br from-violet-500/10 to-violet-500/5 hover:from-violet-500/15 hover:to-violet-500/10",
                  "hover:scale-[1.02]"
                )}>
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-3">
                      <TrendingUp className="h-6 w-6 text-violet-500" />
                      <span className="text-sm font-medium text-violet-500 bg-violet-500/15 px-2 py-1 rounded-full">
                        Insights
                      </span>
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">Performance Check</h3>
                    <p className="text-sm text-muted-foreground">
                      Wie laufen deine Posts?
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )
          )}

          {/* Fallback actions when queue and review are empty */}
          {briefing && briefing.queueCount === 0 && briefing.pendingReviewCount === 0 && !briefing.nextGapDay && (
            <>
              <Link to="/generator" className="block">
                <Card className={cn(
                  "h-full cursor-pointer transition-all duration-300",
                  "border-primary/30 hover:border-primary hover:shadow-lg hover:shadow-primary/10",
                  "bg-gradient-to-br from-primary/10 to-primary/5 hover:from-primary/15 hover:to-primary/10",
                  "hover:scale-[1.02]"
                )}>
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-3">
                      <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">Content erstellen</h3>
                    <p className="text-sm text-muted-foreground">
                      Neuen Post mit KI generieren
                    </p>
                  </CardContent>
                </Card>
              </Link>
              
              <Link to="/community" className="block">
                <Card className={cn(
                  "h-full cursor-pointer transition-all duration-300",
                  "border-cyan-500/30 hover:border-cyan-500 hover:shadow-lg hover:shadow-cyan-500/10",
                  "bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 hover:from-cyan-500/15 hover:to-cyan-500/10",
                  "hover:scale-[1.02]"
                )}>
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-3">
                      <MessageCircle className="h-6 w-6 text-cyan-500" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">Community öffnen</h3>
                    <p className="text-sm text-muted-foreground">
                      Kommentare verwalten
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}