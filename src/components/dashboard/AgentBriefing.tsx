import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { 
  MessageCircle, 
  Lightbulb, 
  Sparkles,
  ArrowRight,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentBriefingProps {
  userName?: string;
  onOpenChat?: () => void;
}

interface BriefingData {
  queueCount: number;
  ideaCount: number;
  scheduledCount: number;
  pendingReviewCount: number;
}

export function AgentBriefing({ userName, onOpenChat }: AgentBriefingProps) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBriefingData();
  }, []);

  const loadBriefingData = async () => {
    try {
      const [queueRes, postsRes, ideasRes] = await Promise.all([
        supabase
          .from("comment_reply_queue")
          .select("id", { count: "exact" })
          .in("status", ["pending", "waiting_for_post"]),
        supabase
          .from("posts")
          .select("status"),
        supabase
          .from("content_plan")
          .select("id", { count: "exact" })
          .eq("status", "idea"),
      ]);

      const posts = postsRes.data || [];
      const scheduledCount = posts.filter(p => p.status === "SCHEDULED").length;
      const pendingReviewCount = posts.filter(p => p.status === "READY_FOR_REVIEW").length;

      setBriefing({
        queueCount: queueRes.count || 0,
        ideaCount: ideasRes.count || 0,
        scheduledCount,
        pendingReviewCount,
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
    
    if (briefing.queueCount > 0) {
      parts.push(`${briefing.queueCount} Antwort${briefing.queueCount !== 1 ? "en" : ""} in der Warteschlange`);
    }
    
    if (briefing.pendingReviewCount > 0) {
      parts.push(`${briefing.pendingReviewCount} Post${briefing.pendingReviewCount !== 1 ? "s" : ""} zur Prüfung`);
    }
    
    if (briefing.scheduledCount > 0) {
      parts.push(`${briefing.scheduledCount} geplante${briefing.scheduledCount !== 1 ? "" : "r"} Post${briefing.scheduledCount !== 1 ? "s" : ""}`);
    }

    if (parts.length === 0) {
      return "Alles ruhig hier! Sollen wir neuen Content erstellen oder nach Kommentaren schauen?";
    }

    return `Ich habe ${parts.join(" und ")} für dich vorbereitet. Womit wollen wir starten?`;
  };

  if (loading) {
    return (
      <Card className="glass-card border-primary/20">
        <CardContent className="p-6 flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-primary/20 relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan-500/5" />
      
      <CardContent className="relative z-10 p-6 space-y-6">
        {/* Chat bubble from Co-Pilot */}
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-lg shadow-primary/25">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
          </div>
          
          {/* Message */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Co-Pilot</span>
              <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                Aktiv
              </Badge>
            </div>
            
            <div className="bg-muted/50 rounded-2xl rounded-tl-md p-4 max-w-2xl">
              <p className="text-foreground">
                {getGreeting()}{userName ? `, ${userName}` : ""}! 👋
              </p>
              <p className="text-muted-foreground mt-1">
                {getBriefingMessage()}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 ml-16">
          {briefing && briefing.queueCount > 0 && (
            <Link to="/community">
              <Button 
                size="lg" 
                className={cn(
                  "h-12 px-6 rounded-xl gap-2",
                  "bg-gradient-to-r from-primary to-primary/80",
                  "hover:from-primary/90 hover:to-primary/70",
                  "shadow-lg shadow-primary/20"
                )}
              >
                <MessageCircle className="h-5 w-5" />
                Antworten prüfen
                <Badge variant="secondary" className="ml-1 bg-white/20 text-white border-0">
                  {briefing.queueCount}
                </Badge>
              </Button>
            </Link>
          )}
          
          {briefing && briefing.pendingReviewCount > 0 && (
            <Link to="/review">
              <Button 
                size="lg" 
                variant="outline"
                className="h-12 px-6 rounded-xl gap-2 glass-button"
              >
                <Lightbulb className="h-5 w-5" />
                Posts reviewen
                <Badge variant="secondary" className="ml-1">
                  {briefing.pendingReviewCount}
                </Badge>
              </Button>
            </Link>
          )}

          {briefing && briefing.queueCount === 0 && briefing.pendingReviewCount === 0 && (
            <>
              <Link to="/generator">
                <Button 
                  size="lg" 
                  className={cn(
                    "h-12 px-6 rounded-xl gap-2",
                    "bg-gradient-to-r from-primary to-cyan-500",
                    "hover:from-primary/90 hover:to-cyan-500/90",
                    "shadow-lg shadow-primary/20"
                  )}
                >
                  <Sparkles className="h-5 w-5" />
                  Content erstellen
                </Button>
              </Link>
              
              <Link to="/community">
                <Button 
                  size="lg" 
                  variant="outline"
                  className="h-12 px-6 rounded-xl gap-2 glass-button"
                >
                  <MessageCircle className="h-5 w-5" />
                  Community öffnen
                </Button>
              </Link>
            </>
          )}

          {onOpenChat && (
            <Button 
              size="lg" 
              variant="ghost"
              className="h-12 px-6 rounded-xl gap-2"
              onClick={onOpenChat}
            >
              Mit Co-Pilot chatten
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
