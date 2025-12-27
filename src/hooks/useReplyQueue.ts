import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface QueuedCommentIds {
  pending: Set<string>;
  waiting: Set<string>;
  failed: Set<string>;
}

export function useReplyQueue() {
  const [queuedIds, setQueuedIds] = useState<QueuedCommentIds>({
    pending: new Set(),
    waiting: new Set(),
    failed: new Set(),
  });
  const [queueSchedules, setQueueSchedules] = useState<Map<string, string>>(new Map());

  const loadQueuedComments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("comment_reply_queue")
        .select("comment_id, status, scheduled_for")
        .in("status", ["pending", "waiting_for_post", "failed"]);

      if (error) throw error;

      const pending = new Set<string>();
      const waiting = new Set<string>();
      const failed = new Set<string>();
      const schedules = new Map<string, string>();

      (data || []).forEach((item) => {
        if (!item.comment_id) return;
        
        if (item.status === "pending") {
          pending.add(item.comment_id);
          if (item.scheduled_for) {
            schedules.set(item.comment_id, item.scheduled_for);
          }
        } else if (item.status === "waiting_for_post") {
          waiting.add(item.comment_id);
        } else if (item.status === "failed") {
          failed.add(item.comment_id);
        }
      });

      setQueuedIds({ pending, waiting, failed });
      setQueueSchedules(schedules);
    } catch (err) {
      console.error("Error loading queued comments:", err);
    }
  }, []);

  useEffect(() => {
    loadQueuedComments();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("queue-status-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comment_reply_queue",
        },
        () => {
          loadQueuedComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadQueuedComments]);

  const isInQueue = useCallback(
    (commentId: string) => {
      return (
        queuedIds.pending.has(commentId) ||
        queuedIds.waiting.has(commentId) ||
        queuedIds.failed.has(commentId)
      );
    },
    [queuedIds]
  );

  const getQueueStatus = useCallback(
    (commentId: string): "pending" | "waiting" | "failed" | null => {
      if (queuedIds.pending.has(commentId)) return "pending";
      if (queuedIds.waiting.has(commentId)) return "waiting";
      if (queuedIds.failed.has(commentId)) return "failed";
      return null;
    },
    [queuedIds]
  );

  const getScheduledTime = useCallback(
    (commentId: string): string | null => {
      return queueSchedules.get(commentId) || null;
    },
    [queueSchedules]
  );

  return {
    queuedIds,
    isInQueue,
    getQueueStatus,
    getScheduledTime,
    refreshQueue: loadQueuedComments,
  };
}
