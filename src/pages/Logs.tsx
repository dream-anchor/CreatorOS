import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Log, LogLevel } from "@/types/database";
import { Loader2, AlertCircle, Info, AlertTriangle, ScrollText } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

const levelConfig: Record<LogLevel, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-info" },
  warn: { icon: AlertTriangle, className: "text-warning" },
  error: { icon: AlertCircle, className: "text-destructive" },
};

export default function LogsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<Log[]>([]);
  const [levelFilter, setLevelFilter] = useState<string>("all");

  useEffect(() => {
    if (user) loadLogs();
  }, [user]);

  const loadLogs = async () => {
    try {
      const { data, error } = await supabase
        .from("logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs((data as Log[]) || []);
    } catch (error: any) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = levelFilter === "all" ? logs : logs.filter((l) => l.level === levelFilter);

  if (loading) {
    return (
      <AppLayout title="Logs">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Logs"
      description="Aktivitätsprotokoll und Ereignisse"
      actions={
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warnung</SelectItem>
            <SelectItem value="error">Fehler</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {filteredLogs.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ScrollText className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Keine Logs vorhanden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const config = levelConfig[log.level];
            const Icon = config.icon;
            return (
              <Card key={log.id} className="glass-card">
                <CardContent className="flex items-start gap-4 py-4">
                  <Icon className={`h-5 w-5 mt-0.5 ${config.className}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{log.event_type}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd. MMM yyyy, HH:mm:ss", { locale: de })}
                      </span>
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <pre className="text-xs text-muted-foreground mt-2 p-2 rounded bg-muted overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
