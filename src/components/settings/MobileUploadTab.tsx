import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ExternalLinkIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { apiGet, invokeFunction } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp } from "lucide-react";

const SHORTCUT_URL = "https://www.icloud.com/shortcuts/8006547ced474e44a55338b3310609b0";

interface UploadLogEntry {
  id: string;
  created_at: string;
  event_type: string;
  level: string;
  post_id: string | null;
  details: {
    files_count?: number;
    scheduled_for?: string;
    error?: string;
    source?: string;
  };
}

export default function MobileUploadTab() {
  const { user } = useAuth();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "success" | "error">("idle");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [uploadLogs, setUploadLogs] = useState<UploadLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [isTroubleshootingOpen, setIsTroubleshootingOpen] = useState(false);

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(false);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);

  const endpointUrl = `${import.meta.env.VITE_API_URL || ''}/api/upload/shortcut-upload`;

  // Load upload logs
  useEffect(() => {
    if (!user) return;

    const loadLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const data = await apiGet<UploadLogEntry[]>("/api/logs", {
          event_types: "shortcut_upload,shortcut_upload_error",
          limit: "10",
        });
        setUploadLogs(data || []);
      } catch (error) {
        console.error("Error loading logs:", error);
      }
      setIsLoadingLogs(false);
    };

    loadLogs();
  }, [user]);

  const maskApiKey = (key: string) => {
    if (!key) return "";
    if (key.length <= 10) return "••••••";
    return `${key.slice(0, 4)}…${key.slice(-4)}`;
  };

  // Load shortcut API key (needed for iOS shortcut installation)
  useEffect(() => {
    let isActive = true;

    if (!user) {
      setApiKey(null);
      setIsApiKeyVisible(false);
      return;
    }

    (async () => {
      setIsLoadingApiKey(true);
      try {
        const { data, error } = await invokeFunction("get-shortcut-api-key");

        if (!isActive) return;

        if (error) {
          console.error("Error loading shortcut API key:", error);
          setApiKey(null);
          toast.error("API-Key konnte nicht geladen werden");
          return;
        }

        setApiKey((data as any)?.apiKey ?? null);
      } catch (e) {
        if (!isActive) return;
        console.error("Error loading shortcut API key:", e);
        setApiKey(null);
        toast.error("API-Key konnte nicht geladen werden");
      } finally {
        if (isActive) setIsLoadingApiKey(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [user]);

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success("Kopiert!");
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  const testConnection = async () => {
    setIsTestingConnection(true);
    setConnectionStatus("idle");
    setConnectionError(null);

    try {
      const keyForTest = apiKey ?? "TEST_PING_CHECK";

      const response = await fetch(endpointUrl, {
        method: "GET",
        headers: {
          "x-api-key": keyForTest,
        },
      });

      if (response.ok) {
        setConnectionStatus("success");
        toast.success("Verbindung erfolgreich!");
        return;
      }

      // If we don't have the real key yet, a 401 still proves reachability
      if (response.status === 401 && !apiKey) {
        setConnectionStatus("success");
        toast.success("Server erreichbar (API-Key fehlt noch)");
        return;
      }

      const data = await response.json().catch(() => ({}));
      setConnectionStatus("error");
      setConnectionError(data.error || `HTTP ${response.status}`);
      toast.error("Verbindungsfehler");
    } catch {
      setConnectionStatus("error");
      setConnectionError("Server nicht erreichbar");
      toast.error("Server nicht erreichbar");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const refreshLogs = async () => {
    if (!user) return;
    setIsLoadingLogs(true);
    
    try {
      const data = await apiGet<UploadLogEntry[]>("/api/logs", {
        event_types: "shortcut_upload,shortcut_upload_error",
        limit: "10",
      });
      setUploadLogs(data || []);
    } catch {}
    setIsLoadingLogs(false);
  };

  return (
    <div className="space-y-6">
      {/* Installation Card */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Smartphone className="h-5 w-5 text-primary" />
            Mobile Upload
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Lade den iOS Kurzbefehl, um Bilder direkt aus der Fotos-App zu teilen. 
            Posts werden automatisch erstellt und geplant.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* QR Code */}
            <div className="p-4 bg-white rounded-xl shadow-sm">
              <QRCodeSVG 
                value={SHORTCUT_URL} 
                size={140} 
                level="M"
                includeMargin={false}
              />
            </div>

            {/* Instructions */}
            <div className="flex-1 space-y-4 text-center sm:text-left">
              <div className="space-y-2">
                <h4 className="font-medium">So funktioniert's:</h4>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Scanne den QR-Code oder klicke den Button</li>
                  <li>Installiere den Kurzbefehl auf deinem iPhone</li>
                  <li>Teile Fotos direkt aus der Fotos-App</li>
                </ol>
              </div>

              <Button 
                onClick={() => window.open(SHORTCUT_URL, "_blank")}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Kurzbefehl installieren
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base">⚙️ Konfiguration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* User ID */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">User-ID</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-md text-xs font-mono truncate">
                {user?.id || "Nicht eingeloggt"}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => user?.id && copyToClipboard(user.id, "userId")}
                disabled={!user?.id}
              >
                {copiedField === "userId" ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">API-Key</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-md text-xs font-mono truncate">
                {isLoadingApiKey
                  ? "Lade…"
                  : apiKey
                    ? isApiKeyVisible
                      ? apiKey
                      : maskApiKey(apiKey)
                    : "kein api key"}
              </code>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsApiKeyVisible((v) => !v)}
                  disabled={!apiKey}
                  aria-label={isApiKeyVisible ? "API-Key verbergen" : "API-Key anzeigen"}
                >
                  {isApiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => apiKey && copyToClipboard(apiKey, "apiKey")}
                  disabled={!apiKey}
                  aria-label="API-Key kopieren"
                >
                  {copiedField === "apiKey" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Im Kurzbefehl als Header <span className="font-mono">x-api-key</span> eintragen.
            </p>
          </div>

          {/* Endpoint URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Endpoint-URL</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-md text-xs font-mono truncate">
                {endpointUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(endpointUrl, "endpoint")}
              >
                {copiedField === "endpoint" ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Connection Test */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={isTestingConnection}
              className="gap-2"
            >
              {isTestingConnection ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="h-4 w-4" />
              )}
              Verbindung testen
            </Button>

            {connectionStatus === "success" && (
              <div className="flex items-center gap-1 text-green-600">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">Server erreichbar</span>
              </div>
            )}

            {connectionStatus === "error" && (
              <div className="flex items-center gap-1 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">{connectionError}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Der API-Key wird direkt im Kurzbefehl bei der Installation konfiguriert.
          </p>
        </CardContent>
      </Card>

      {/* Upload History Card */}
      <Card className="glass-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">📊 Letzte Uploads</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={refreshLogs}
            disabled={isLoadingLogs}
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingLogs ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : uploadLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Noch keine Uploads. Teile Fotos über den iOS Kurzbefehl!
            </p>
          ) : (
            <div className="space-y-2">
              {uploadLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    {log.event_type === "shortcut_upload" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {format(new Date(log.created_at), "dd.MM.yyyy, HH:mm", { locale: de })}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {log.event_type === "shortcut_upload" ? (
                          <>
                            {log.details?.files_count || 1} Bild{(log.details?.files_count || 1) > 1 ? "er" : ""}
                            {log.details?.scheduled_for && (
                              <> • Geplant für {format(new Date(log.details.scheduled_for), "dd.MM.", { locale: de })}</>
                            )}
                          </>
                        ) : (
                          <span className="text-destructive">{log.details?.error || "Fehler"}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {log.post_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => window.open(`/calendar`, "_self")}
                    >
                      <ExternalLinkIcon className="h-3 w-3 mr-1" />
                      Post
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Troubleshooting Card */}
      <Card className="glass-card">
        <Collapsible open={isTroubleshootingOpen} onOpenChange={setIsTroubleshootingOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Problemlösung
              </CardTitle>
              {isTroubleshootingOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">401</Badge>
                  <div>
                    <p className="text-sm font-medium">Ungültiger API-Key</p>
                    <p className="text-xs text-muted-foreground">
                      Lösche den Kurzbefehl und installiere ihn neu mit dem korrekten API-Key.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">Timeout</Badge>
                  <div>
                    <p className="text-sm font-medium">Upload dauert zu lange</p>
                    <p className="text-xs text-muted-foreground">
                      Versuche weniger Bilder gleichzeitig zu senden (max. 5-10 pro Upload).
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">Keine Anzeige</Badge>
                  <div>
                    <p className="text-sm font-medium">Upload kommt nicht an</p>
                    <p className="text-xs text-muted-foreground">
                      Prüfe deine Internetverbindung. Der Kurzbefehl zeigt eine Fehlermeldung, falls etwas schiefgeht.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Badge variant="outline" className="shrink-0">User-ID</Badge>
                  <div>
                    <p className="text-sm font-medium">Falsche User-ID im Kurzbefehl</p>
                    <p className="text-xs text-muted-foreground">
                      Stelle sicher, dass die User-ID im Kurzbefehl mit der oben angezeigten übereinstimmt.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
