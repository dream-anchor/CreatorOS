import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/api";

interface QueuedCommentIds {
  pending: Set<string>;
  waiting: Set<string>;
  failed: Set<string>;
}

interface QueueItem {
  comment_id: string;
  status: string;
  scheduled_for: string | null;
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
      const data = await apiGet<QueueItem[]>("/api/community/reply-queue", {
        status: "pending,waiting_for_post,failed",
      });

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

    // Poll for changes every 30 seconds (replaces Supabase Realtime)
    const interval = setInterval(loadQueuedComments, 30000);

    return () => {
      clearInterval(interval);
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
