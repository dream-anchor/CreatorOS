import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Clock, AlertCircle, CheckCircle2, Zap, RefreshCw, Trash2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface QueueItem {
  id: string;
  comment_id: string | null;
  ig_comment_id: string;
  reply_text: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  error_message: string | null;
}

interface ReplyQueueIndicatorProps {
  onQueueChange?: () => void;
}

export function ReplyQueueIndicator({ onQueueChange }: ReplyQueueIndicatorProps) {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isForcing, setIsForcing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const loadQueue = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("comment_reply_queue")
        .select("*")
        .in("status", ["pending", "waiting_for_post", "failed"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setQueueItems(data || []);
    } catch (err) {
      console.error("Error loading queue:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
    
    // Subscribe to realtime changes
    const channel = supabase
      .channel("reply-queue-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comment_reply_queue",
        },
        () => {
          loadQueue();
          onQueueChange?.();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onQueueChange]);

  const forceProcessQueue = async () => {
    setIsForcing(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-reply-queue");
      
      if (error) throw error;
      
      if (data?.sent > 0) {
        toast.success(`⚡ ${data.sent} Antworten gesendet!`);
      } else if (data?.processed === 0) {
        toast.info("Keine fälligen Antworten in der Queue");
      } else {
        toast.info(`Queue verarbeitet: ${data?.sent || 0} gesendet, ${data?.failed || 0} fehlgeschlagen`);
      }
      
      await loadQueue();
      onQueueChange?.();
    } catch (err) {
      console.error("Force queue error:", err);
      toast.error("Fehler beim Verarbeiten der Queue");
    } finally {
      setIsForcing(false);
    }
  };

  const deleteQueueItem = async (id: string) => {
    try {
      const { error } = await supabase
        .from("comment_reply_queue")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      toast.success("Eintrag gelöscht");
      await loadQueue();
      onQueueChange?.();
    } catch (err) {
      console.error("Delete queue item error:", err);
      toast.error("Fehler beim Löschen");
    }
  };

  const pendingCount = queueItems.filter(
    (item) => item.status === "pending" || item.status === "waiting_for_post"
  ).length;
  const failedCount = queueItems.filter((item) => item.status === "failed").length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-3 w-3 text-amber-500" />;
      case "waiting_for_post":
        return <Clock className="h-3 w-3 text-blue-500" />;
      case "failed":
        return <AlertCircle className="h-3 w-3 text-destructive" />;
      default:
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Geplant";
      case "waiting_for_post":
        return "Wartet auf Post";
      case "failed":
        return "Fehlgeschlagen";
      default:
        return status;
    }
  };

  if (pendingCount === 0 && failedCount === 0) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 relative"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Warteschlange</span>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
              {pendingCount}
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5 text-xs">
              {failedCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Antwort-Warteschlange
          </DialogTitle>
          <DialogDescription>
            {pendingCount} wartend, {failedCount} fehlgeschlagen
          </DialogDescription>
        </DialogHeader>

        {/* Force Run Button */}
        <div className="flex gap-2 py-2">
          <Button
            onClick={forceProcessQueue}
            disabled={isForcing || pendingCount === 0}
            className="flex-1 gap-2"
            variant="default"
          >
            {isForcing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Verarbeite...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                Jetzt Queue erzwingen
              </>
            )}
          </Button>
          <Button
            onClick={loadQueue}
            disabled={isLoading}
            variant="outline"
            size="icon"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Queue Items List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
          {queueItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Send className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Keine Einträge in der Queue</p>
            </div>
          ) : (
            queueItems.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-lg border ${
                  item.status === "failed"
                    ? "border-destructive/50 bg-destructive/5"
                    : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getStatusIcon(item.status)}
                      <span className="text-xs font-medium">
                        {getStatusLabel(item.status)}
                      </span>
                      {item.scheduled_for && item.status === "pending" && (
                        <span className="text-xs text-muted-foreground">
                          • {format(new Date(item.scheduled_for), "dd.MM. HH:mm", { locale: de })}
                        </span>
                      )}
                    </div>
                    <p className="text-sm line-clamp-2">{item.reply_text}</p>
                    {item.error_message && (
                      <p className="text-xs text-destructive mt-1">
                        Fehler: {item.error_message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Erstellt: {formatDistanceToNow(new Date(item.created_at), { locale: de, addSuffix: true })}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteQueueItem(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
