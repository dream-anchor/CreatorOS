import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { 
  Activity, 
  Clock, 
  CalendarClock, 
  ScrollText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncLog {
  id: string;
  event_type: string;
  level: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface SyncCockpitProps {
  userId: string;
}

export function SyncCockpit({ userId }: SyncCockpitProps) {
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    loadSyncData();
  }, [userId]);

  const loadSyncData = async () => {
    try {
      // Load settings
      const { data: settings } = await supabase
        .from("settings")
        .select("auto_sync_enabled, last_sync_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (settings) {
        setAutoSyncEnabled(settings.auto_sync_enabled ?? true);
        setLastSyncAt(settings.last_sync_at);
      }

      // Load sync logs
      const { data: logs } = await supabase
        .from("logs")
        .select("*")
        .eq("user_id", userId)
        .in("event_type", ["instagram_history_imported", "instagram_smart_sync", "instagram_sync_error"])
        .order("created_at", { ascending: false })
        .limit(10);

      if (logs) {
        setSyncLogs(logs as SyncLog[]);
      }
    } catch (error) {
      console.error("Error loading sync data:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutoSync = async (enabled: boolean) => {
    setToggling(true);
    try {
      const { error } = await supabase
        .from("settings")
        .update({ auto_sync_enabled: enabled })
        .eq("user_id", userId);

      if (error) throw error;

      setAutoSyncEnabled(enabled);
      toast.success(enabled ? "Automatischer Import aktiviert" : "Automatischer Import pausiert");
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setToggling(false);
    }
  };

  const getLogIcon = (log: SyncLog) => {
    if (log.level === "error") return <XCircle className="h-4 w-4 text-destructive" />;
    if (log.event_type === "instagram_smart_sync") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (log.event_type === "instagram_history_imported") return <CheckCircle2 className="h-4 w-4 text-primary" />;
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  };

  const getLogMessage = (log: SyncLog) => {
    const details = log.details as Record<string, any>;
    
    if (log.level === "error") {
      return `❌ Fehler: ${details.error || details.message || "Unbekannter Fehler"}`;
    }
    
    if (log.event_type === "instagram_smart_sync") {
      const synced = details.synced_count || 0;
      return `✅ ${synced} Posts synchronisiert`;
    }
    
    if (log.event_type === "instagram_history_imported") {
      const total = details.total_fetched || details.inserted_count || 0;
      const unicorns = details.unicorn_count || 0;
      return `✅ ${total} Posts importiert, ${unicorns} Unicorns gefunden`;
    }
    
    return "Sync-Vorgang abgeschlossen";
  };

  const formatLogDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "dd.MM. - HH:mm 'Uhr'", { locale: de });
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Monitor & Controls Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Status Card */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className={cn(
                "h-3 w-3 rounded-full animate-pulse",
                autoSyncEnabled ? "bg-emerald-500" : "bg-amber-500"
              )} />
              <span className="font-semibold text-foreground">
                {autoSyncEnabled ? "Aktiv" : "Pausiert"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Last Sync Card */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Letzter Import
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-foreground">
              {lastSyncAt 
                ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: de })
                : syncLogs.length > 0
                  ? formatDistanceToNow(new Date(syncLogs[0].created_at), { addSuffix: true, locale: de })
                  : "Noch nie"
              }
            </span>
          </CardContent>
        </Card>

        {/* Next Sync Card */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Nächster Import
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-semibold text-foreground">
              {autoSyncEnabled 
                ? "Beim nächsten App-Start" 
                : "Pausiert"
              }
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Toggle & Log Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Auto-Sync Toggle Card */}
        <Card className="glass-card">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-sync" className="text-base font-medium">
                  Automatischer Import
                </Label>
                <p className="text-sm text-muted-foreground">
                  Synchronisiert neue Posts bei jedem App-Start
                </p>
              </div>
              <Switch
                id="auto-sync"
                checked={autoSyncEnabled}
                onCheckedChange={toggleAutoSync}
                disabled={toggling}
              />
            </div>
          </CardContent>
        </Card>

        {/* Import Log Accordion */}
        <Card className="glass-card">
          <CardContent className="py-0">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="logs" className="border-none">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <ScrollText className="h-4 w-4" />
                    <span className="font-medium">Import-Logbuch anzeigen</span>
                    <Badge variant="secondary" className="ml-2">
                      {syncLogs.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2 pb-4">
                    {syncLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Noch keine Import-Vorgänge protokolliert
                      </p>
                    ) : (
                      syncLogs.map((log) => (
                        <div 
                          key={log.id}
                          className="flex items-start gap-2 text-sm p-2 rounded-lg bg-muted/50"
                        >
                          {getLogIcon(log)}
                          <div className="flex-1 min-w-0">
                            <p className="text-foreground truncate">
                              {getLogMessage(log)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatLogDate(log.created_at)}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}