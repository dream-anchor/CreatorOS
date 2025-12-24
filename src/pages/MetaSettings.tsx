import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MetaConnection } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Instagram, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Bug } from "lucide-react";
import { Link } from "react-router-dom";

export default function MetaSettingsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [startingOAuth, setStartingOAuth] = useState(false);

  useEffect(() => {
    if (user) loadConnection();
  }, [user]);

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "true") {
      toast.success("Instagram erfolgreich verbunden!");
      loadConnection();
    } else if (error) {
      const errorMessages: Record<string, string> = {
        no_pages: "Keine Facebook Pages gefunden. Bitte stelle sicher, dass du Admin einer Facebook Page bist.",
        no_instagram: "Kein Instagram Business-Konto mit der Facebook Page verknüpft.",
        token_error: "Fehler beim Abrufen des Tokens. Bitte versuche es erneut.",
        config_error: "Meta App nicht konfiguriert. Bitte kontaktiere den Administrator.",
        save_error: "Fehler beim Speichern der Verbindung.",
        missing_params: "Ungültige OAuth-Antwort.",
      };
      toast.error(errorMessages[error] || "Verbindung fehlgeschlagen: " + error);
    }
  }, [searchParams]);

  const loadConnection = async () => {
    try {
      const { data, error } = await supabase
        .from("meta_connections")
        .select("id, user_id, page_id, page_name, ig_user_id, ig_username, token_expires_at, connected_at, updated_at")
        .maybeSingle();

      if (error) throw error;
      if (data) setConnection(data as MetaConnection);
    } catch (error: unknown) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const startOAuth = async () => {
    if (!user) {
      toast.error("Bitte zuerst einloggen");
      return;
    }

    setStartingOAuth(true);
    try {
      // Get OAuth URL from server (uses server-side META_APP_ID)
      const response = await supabase.functions.invoke('meta-oauth-config', {
        body: {}
      });

      if (response.error) {
        console.error('OAuth config error:', response.error);
        toast.error(response.error.message || 'Fehler beim Abrufen der OAuth-Konfiguration');
        return;
      }

      const data = response.data as any;

      if (!data.auth_url) {
        toast.error('Keine OAuth URL erhalten. Bitte META_APP_ID konfigurieren.');
        return;
      }

      console.log('Starting OAuth with mode:', data.meta_oauth_mode, 'scopes:', data.scopes);
      window.location.href = data.auth_url;
    } catch (err) {
      console.error('Error starting OAuth:', err);
      toast.error('Fehler beim Starten der OAuth-Verbindung');
    } finally {
      setStartingOAuth(false);
    }
  };

  const disconnect = async () => {
    if (!connection) return;
    setDisconnecting(true);

    try {
      const { error } = await supabase
        .from("meta_connections")
        .delete()
        .eq("id", connection.id);

      if (error) throw error;

      setConnection(null);
      toast.success("Verbindung getrennt");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Fehler";
      toast.error("Trennen fehlgeschlagen: " + msg);
    } finally {
      setDisconnecting(false);
    }
  };

  const isConnected = connection?.ig_user_id;
  const isExpired = connection?.token_expires_at && new Date(connection.token_expires_at) < new Date();

  if (loading) {
    return (
      <AppLayout title="Meta Verbindung">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Meta Verbindung" description="Verbinde dein Instagram Professional-Konto">
      <div className="max-w-2xl space-y-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Instagram className="h-5 w-5" />
              Instagram Verbindung
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isConnected && !isExpired ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/30">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <div className="flex-1">
                    <p className="font-medium text-success">Verbunden</p>
                    <p className="text-sm text-muted-foreground">
                      @{connection?.ig_username || connection?.ig_user_id} • {connection?.page_name}
                    </p>
                    {connection?.token_expires_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Token gültig bis: {new Date(connection.token_expires_at).toLocaleDateString("de-DE")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={startOAuth} disabled={startingOAuth}>
                    {startingOAuth ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Erneut verbinden
                  </Button>
                  <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
                    {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Trennen
                  </Button>
                </div>
              </div>
            ) : isExpired ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
                  <AlertCircle className="h-5 w-5 text-warning" />
                  <div>
                    <p className="font-medium text-warning">Token abgelaufen</p>
                    <p className="text-sm text-muted-foreground">Bitte erneut verbinden</p>
                  </div>
                </div>
                <Button onClick={startOAuth} disabled={startingOAuth}>
                  {startingOAuth ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Instagram className="mr-2 h-4 w-4" />}
                  Erneut verbinden
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-muted border border-border">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <p className="text-muted-foreground">Nicht verbunden</p>
                </div>
                <Button onClick={startOAuth} disabled={startingOAuth}>
                  {startingOAuth ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starte OAuth...
                    </>
                  ) : (
                    <>
                      <Instagram className="mr-2 h-4 w-4" />
                      Mit Instagram verbinden
                    </>
                  )}
                </Button>
              </div>
            )}

            <div className="space-y-3 pt-4 border-t border-border">
              <h4 className="font-medium">Voraussetzungen:</h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">1.</span>
                  Instagram Professional-Konto (Business oder Creator)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">2.</span>
                  Mit einer Facebook Page verknüpft (du musst Admin sein)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">3.</span>
                  Meta Developer App mit Instagram Graph API Zugriff
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-border">
              <h4 className="font-medium mb-2">Setup-Anleitung:</h4>
              <ol className="text-sm text-muted-foreground space-y-2">
                <li>1. Erstelle eine Meta Developer App unter developers.facebook.com</li>
                <li>2. Füge das Produkt "Facebook Login for Business" hinzu</li>
                <li>3. Aktiviere den Use Case "Instagram Graph API"</li>
                <li>4. Füge die benötigten Permissions hinzu: instagram_business_basic, instagram_business_content_publish, instagram_business_manage_comments, instagram_business_manage_messages, instagram_business_manage_insights, pages_show_list, pages_read_engagement, business_management</li>
                <li>5. Setze META_APP_ID und META_APP_SECRET in den Server Secrets</li>
              </ol>
              <div className="flex gap-3 mt-4">
                <Button variant="outline" asChild>
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Meta Developer Portal
                  </a>
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/debug/oauth">
                    <Bug className="mr-2 h-4 w-4" />
                    OAuth Debug
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
