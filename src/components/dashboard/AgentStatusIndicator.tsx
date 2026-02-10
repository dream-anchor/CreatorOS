import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AgentStatusIndicatorProps {
  className?: string;
}

export function AgentStatusIndicator({ className }: AgentStatusIndicatorProps) {
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [nextCheckIn, setNextCheckIn] = useState<number>(5);
  const [isActive, setIsActive] = useState(true);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    // Initial load
    checkStatus();
    
    // Update countdown every second
    const countdownInterval = setInterval(() => {
      setNextCheckIn(prev => {
        if (prev <= 1/60) {
          // Simulate next check
          checkStatus();
          return 5; // Reset to 5 minutes
        }
        return prev - 1/60; // Decrease by 1 second
      });
    }, 1000);

    return () => {
      clearInterval(countdownInterval);
    };
  }, []);

  const checkStatus = async () => {
    try {
      const data = await apiGet<{ count: number }>("/api/community/reply-queue/pending-count");
      setQueueCount(data?.count || 0);
      setLastCheck(new Date());
      setIsActive(true);
    } catch (error) {
      console.error("Error checking agent status:", error);
      setIsActive(false);
    }
  };

  const formatNextCheck = () => {
    const minutes = Math.floor(nextCheckIn);
    const seconds = Math.floor((nextCheckIn % 1) * 60);
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-3 px-4 py-2 rounded-full",
            "bg-background/80 backdrop-blur-sm border border-border/50",
            "shadow-sm",
            className
          )}>
            {/* Animated pulse dot */}
            <div className="relative flex items-center justify-center">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full",
                isActive ? "bg-emerald-500" : "bg-muted-foreground"
              )} />
              {isActive && (
                <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping opacity-50" />
              )}
            </div>
            
            <span className={cn(
              "text-sm font-medium",
              isActive ? "text-emerald-500" : "text-muted-foreground"
            )}>
              Auto-Pilot {isActive ? "aktiv" : "pausiert"}
            </span>

            <div className="w-px h-4 bg-border" />

            <span className="text-sm text-muted-foreground">
              ⏳ {formatNextCheck()}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">Auto-Pilot Status</p>
            <p className="text-xs text-muted-foreground">
              Der Agent prüft alle 5 Minuten auf neue Kommentare und sendet geplante Antworten.
            </p>
            {queueCount > 0 && (
              <p className="text-xs text-primary">
                📤 {queueCount} Antwort{queueCount !== 1 ? "en" : ""} in der Warteschlange
              </p>
            )}
            {lastCheck && (
              <p className="text-xs text-muted-foreground">
                Letzter Check: {lastCheck.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}