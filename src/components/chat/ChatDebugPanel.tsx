import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { invokeFunction } from "@/lib/api";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface DebugPanelProps {
  data: {
    queue: {
      accessible: boolean;
      error?: string;
      items: any[];
      counts: {
        pending: number;
        waiting: number;
        failed: number;
        sent: number;
      };
    };
    cron: {
      lastRun: string | null;
      recentLogs: any[];
    };
    connection: {
      connected: boolean;
      username?: string;
    };
  };
}

export function ChatDebugPanel({ data }: DebugPanelProps) {
  const [isForcing, setIsForcing] = useState(false);

  const handleForceQueue = async () => {
    setIsForcing(true);
    try {
      const { data: result, error } = await invokeFunction("process-reply-queue");
      
      if (error) throw error;
      
      toast.success(`Queue verarbeitet! ${result?.processed || 0} Antworten gesendet.`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`Force Run fehlgeschlagen: ${errorMsg}`);
    } finally {
      setIsForcing(false);
    }
  };

  const StatusIcon = ({ ok }: { ok: boolean }) => 
    ok ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />;

  return (
    <Card className="p-4 bg-card/80 border-border/50 w-full">
      <div className="space-y-4">
        {/* Database Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Queue-Tabelle</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon ok={data.queue.accessible} />
            <span className="text-sm text-muted-foreground">
              {data.queue.accessible ? "Erreichbar" : data.queue.error || "Fehler"}
            </span>
          </div>
        </div>

        {/* Queue Counts */}
        {data.queue.accessible && (
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-primary">{data.queue.counts.pending}</div>
              <div className="text-[10px] text-muted-foreground">Pending</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-amber-500">{data.queue.counts.waiting}</div>
              <div className="text-[10px] text-muted-foreground">Waiting</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-red-500">{data.queue.counts.failed}</div>
              <div className="text-[10px] text-muted-foreground">Failed</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-emerald-500">{data.queue.counts.sent}</div>
              <div className="text-[10px] text-muted-foreground">Sent</div>
            </div>
          </div>
        )}

        {/* Instagram Connection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Instagram</span>
          </div>
          <div className="flex items-center gap-2">
            <StatusIcon ok={data.connection.connected} />
            <span className="text-sm text-muted-foreground">
              {data.connection.connected ? `@${data.connection.username}` : "Nicht verbunden"}
            </span>
          </div>
        </div>

        {/* Cron Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Letzter Cron-Run</span>
          </div>
          <div className="flex items-center gap-2">
            {data.cron.lastRun ? (
              <>
                <StatusIcon ok={true} />
                <span className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(data.cron.lastRun), { addSuffix: true, locale: de })}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-500">Kein Log gefunden</span>
              </>
            )}
          </div>
        </div>

        {/* Warning if cron hasn't run */}
        {!data.cron.lastRun && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-500">
              ⚠️ Der Cronjob scheint nicht eingerichtet zu sein. Nutze den Button unten zum manuellen Versenden.
            </p>
          </div>
        )}

        {/* Force Run Button */}
        <Button
          onClick={handleForceQueue}
          disabled={isForcing || !data.queue.accessible}
          className="w-full bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90"
        >
          {isForcing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Verarbeite...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              ⚡ Jetzt Queue erzwingen (Force Run)
            </>
          )}
        </Button>

        {/* Recent logs preview */}
        {data.cron.recentLogs.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <p className="mb-1">Letzte Logs:</p>
            <div className="space-y-1 max-h-20 overflow-y-auto">
              {data.cron.recentLogs.slice(0, 3).map((log: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground">
                    {new Date(log.created_at).toLocaleString('de-DE')}
                  </span>
                  <Badge variant="outline" className="text-[9px] h-4">
                    {log.event_type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
