import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
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
        if (prev <= 1) {
          // Simulate next check
          checkStatus();
          return 5; // Reset to 5 minutes
        }
        return prev - 1/60; // Decrease by 1 second
      });
    }, 1000);

    // Subscribe to queue changes
    const channel = supabase
      .channel('agent-status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comment_reply_queue'
        },
        () => {
          checkStatus();
        }
      )
      .subscribe();

    return () => {
      clearInterval(countdownInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  const checkStatus = async () => {
    try {
      const { count } = await supabase
        .from("comment_reply_queue")
        .select("id", { count: "exact" })
        .in("status", ["pending", "waiting_for_post"]);
      
      setQueueCount(count || 0);
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
      return `${minutes} Min`;
    }
    return `${seconds}s`;
  };

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs",
      "bg-muted/50 border border-border/50",
      className
    )}>
      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        <div className={cn(
          "w-2 h-2 rounded-full",
          isActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
        )} />
        <span className={cn(
          "font-medium",
          isActive ? "text-emerald-500" : "text-muted-foreground"
        )}>
          {isActive ? "Agent aktiv" : "Agent inaktiv"}
        </span>
      </div>

      <span className="text-muted-foreground">|</span>

      {/* Queue count if any */}
      {queueCount > 0 && (
        <>
          <span className="text-muted-foreground">
            📤 {queueCount} in Queue
          </span>
          <span className="text-muted-foreground">|</span>
        </>
      )}

      {/* Next check countdown */}
      <span className="text-muted-foreground">
        ⏳ Nächster Check in {formatNextCheck()}
      </span>
    </div>
  );
}
