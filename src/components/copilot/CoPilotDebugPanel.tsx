import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2,
  Zap,
  Clock,
  Database,
  Link2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface CoPilotDebugPanelProps {
  data: {
    queue: {
      accessible: boolean;
      error?: string;
      counts: {
        pending: number;
        waiting: number;
        failed: number;
        sent: number;
      };
    };
    cron: {
      lastRun: string | null;
    };
    connection: {
      connected: boolean;
      username?: string;
    };
  };
}

export function CoPilotDebugPanel({ data }: CoPilotDebugPanelProps) {
  const [isForcing, setIsForcing] = useState(false);

  const handleForceQueue = async () => {
    setIsForcing(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("process-reply-queue");
      if (error) throw error;
      toast.success(`Queue verarbeitet! ${result?.processed || 0} gesendet.`);
    } catch (error) {
      toast.error(`Force Run fehlgeschlagen`);
    } finally {
      setIsForcing(false);
    }
  };

  const StatusIcon = ({ ok }: { ok: boolean }) => 
    ok ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />;

  return (
    <Card className="p-3 bg-card/90 border-border/50 text-xs w-full">
      <div className="space-y-3">
        {/* Database */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">Queue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusIcon ok={data.queue.accessible} />
            <span className="text-muted-foreground">
              {data.queue.accessible ? "OK" : "Fehler"}
            </span>
          </div>
        </div>

        {/* Counts */}
        {data.queue.accessible && (
          <div className="grid grid-cols-4 gap-1.5">
            <div className="bg-muted/50 rounded p-1.5 text-center">
              <div className="text-sm font-bold text-primary">{data.queue.counts.pending}</div>
              <div className="text-[9px] text-muted-foreground">Pending</div>
            </div>
            <div className="bg-muted/50 rounded p-1.5 text-center">
              <div className="text-sm font-bold text-amber-500">{data.queue.counts.waiting}</div>
              <div className="text-[9px] text-muted-foreground">Waiting</div>
            </div>
            <div className="bg-muted/50 rounded p-1.5 text-center">
              <div className="text-sm font-bold text-red-500">{data.queue.counts.failed}</div>
              <div className="text-[9px] text-muted-foreground">Failed</div>
            </div>
            <div className="bg-muted/50 rounded p-1.5 text-center">
              <div className="text-sm font-bold text-emerald-500">{data.queue.counts.sent}</div>
              <div className="text-[9px] text-muted-foreground">Sent</div>
            </div>
          </div>
        )}

        {/* Instagram */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">Instagram</span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusIcon ok={data.connection.connected} />
            <span className="text-muted-foreground">
              {data.connection.connected ? `@${data.connection.username}` : "Nicht verbunden"}
            </span>
          </div>
        </div>

        {/* Cron */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">Cron</span>
          </div>
          <div className="flex items-center gap-1.5">
            {data.cron.lastRun ? (
              <>
                <StatusIcon ok={true} />
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(data.cron.lastRun), { addSuffix: true, locale: de })}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-amber-500">Kein Log</span>
              </>
            )}
          </div>
        </div>

        {/* Force Button */}
        <Button
          onClick={handleForceQueue}
          disabled={isForcing || !data.queue.accessible}
          size="sm"
          className="w-full h-8 text-xs bg-gradient-to-r from-primary to-cyan-500"
        >
          {isForcing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <Zap className="h-3.5 w-3.5 mr-1.5" />
          )}
          Force Run Queue
        </Button>
      </div>
    </Card>
  );
}
