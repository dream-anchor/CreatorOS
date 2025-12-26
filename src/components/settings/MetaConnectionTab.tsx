import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MetaConnection } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Instagram, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Bug, User } from "lucide-react";

interface InstagramAccount {
  ig_user_id: string;
  ig_username: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
  profile_picture_url?: string;
}

interface AuthCallbackState {
  accounts: InstagramAccount[];
  token_expires_at: string;
}

export default function MetaConnectionTab() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [startingOAuth, setStartingOAuth] = useState(false);
  
  const [showAccountSelection, setShowAccountSelection] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<InstagramAccount[]>([]);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string>("");
  const [selectingAccount, setSelectingAccount] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadConnection();
  }, [user]);

  useEffect(() => {
    const selectAccount = searchParams.get("select_account");
    
    if (selectAccount === "true") {
      const storedData = sessionStorage.getItem("instagram_auth_accounts");
      if (storedData) {
        try {
          const authState: AuthCallbackState = JSON.parse(storedData);
          setAvailableAccounts(authState.accounts);
          setTokenExpiresAt(authState.token_expires_at);
          setShowAccountSelection(true);
          setSearchParams({});
        } catch (e) {
          console.error("Failed to parse stored accounts:", e);
        }
      }
    }

    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success === "true") {
      toast.success("Instagram erfolgreich verbunden!");
      loadConnection();
    } else if (error) {
      const errorMessages: Record<string, string> = {
        no_pages: "Keine Facebook Pages gefunden.",
        no_instagram: "Kein Instagram Business-Konto gefunden.",
        token_error: "Token-Fehler. Bitte erneut versuchen.",
        config_error: "Meta App nicht konfiguriert.",
        save_error: "Speichern fehlgeschlagen.",
        missing_params: "Ungültige OAuth-Antwort.",
      };
      toast.error(errorMessages[error] || "Verbindung fehlgeschlagen: " + error);
    }
  }, [searchParams, setSearchParams]);

  const loadConnection = async () => {
    try {
      const { data, error } = await supabase
        .from("meta_connections")
        .select("id, user_id, page_id, page_name, ig_user_id, ig_username, token_expires_at, connected_at, updated_at")
        .maybeSingle();

      if (error) throw error;
      if (data) setConnection(data as MetaConnection);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const startOAuth = () => {
    if (!user) {
      toast.error("Bitte zuerst einloggen");
      return;
    }

    setStartingOAuth(true);
    const clientId = "907189555065398";
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/callback`);
    const scopes = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement";
    const oauthUrl = `https://www.facebook.com/v17.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code`;
    window.location.href = oauthUrl;
  };

  const selectAccount = async (account: InstagramAccount) => {
    setSelectingAccount(account.ig_user_id);
    
    try {
      const response = await supabase.functions.invoke('instagram-auth', {
        body: { 
          action: 'select_account',
          selected_account: { ...account, token_expires_at: tokenExpiresAt }
        }
      });

      if (response.error) throw new Error(response.error.message || 'Fehler');
      const data = response.data as any;
      if (!data.success) throw new Error(data.error || 'Fehlgeschlagen');

      sessionStorage.removeItem("instagram_auth_accounts");
      setShowAccountSelection(false);
      setAvailableAccounts([]);
      
      toast.success(`@${account.ig_username} verbunden!`);
      await loadConnection();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast.error(`Fehler: ${message}`);
    } finally {
      setSelectingAccount(null);
    }
  };

  const disconnect = async () => {
    if (!connection) return;
    setDisconnecting(true);

    try {
      const { error } = await supabase.from("meta_connections").delete().eq("id", connection.id);
      if (error) throw error;
      setConnection(null);
      toast.success("Verbindung getrennt");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Fehler";
      toast.error("Trennen fehlgeschlagen: " + msg);
    } finally {
      setDisconnecting(false);
    }
  };

  const cancelAccountSelection = () => {
    sessionStorage.removeItem("instagram_auth_accounts");
    setShowAccountSelection(false);
    setAvailableAccounts([]);
  };

  const isConnected = connection?.ig_user_id;
  const isExpired = connection?.token_expires_at && new Date(connection.token_expires_at) < new Date();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showAccountSelection && availableAccounts.length > 0 && (
        <Card className="glass-card border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Instagram className="h-5 w-5" />
              Instagram-Konto auswählen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Wähle das Instagram-Konto:
            </p>
            
            <div className="grid gap-3">
              {availableAccounts.map((account) => (
                <button
                  key={account.ig_user_id}
                  onClick={() => selectAccount(account)}
                  disabled={selectingAccount !== null}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/50 transition-all text-left disabled:opacity-50"
                >
                  {account.profile_picture_url ? (
                    <img src={account.profile_picture_url} alt={account.ig_username} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">@{account.ig_username}</p>
                    <p className="text-sm text-muted-foreground truncate">{account.page_name}</p>
                  </div>
                  {selectingAccount === account.ig_user_id ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground/30" />
                  )}
                </button>
              ))}
            </div>

            <Button variant="ghost" onClick={cancelAccountSelection} className="w-full">
              Abbrechen
            </Button>
          </CardContent>
        </Card>
      )}

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
              <div className="flex items-center gap-3 p-4 rounded-xl bg-success/10 border border-success/30">
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
              <div className="flex gap-3 flex-wrap">
                <Button variant="outline" onClick={startOAuth} disabled={startingOAuth} className="glass-button">
                  {startingOAuth ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Profil wechseln
                </Button>
                <Button variant="destructive" onClick={disconnect} disabled={disconnecting}>
                  {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Trennen
                </Button>
              </div>
            </div>
          ) : isExpired ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-warning/10 border border-warning/30">
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
              <div className="flex items-center gap-3 p-4 rounded-xl bg-muted border border-border">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <p className="text-muted-foreground">Nicht verbunden</p>
              </div>
              <Button onClick={startOAuth} disabled={startingOAuth}>
                {startingOAuth ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verbinde...</>
                ) : (
                  <><Instagram className="mr-2 h-4 w-4" />Mit Instagram verbinden</>
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
                Mit einer Facebook Page verknüpft
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-medium">3.</span>
                Meta Developer App konfiguriert
              </li>
            </ul>
          </div>

          <div className="pt-4 border-t border-border">
            <Button variant="outline" asChild className="glass-button">
              <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Meta Developer Portal
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
