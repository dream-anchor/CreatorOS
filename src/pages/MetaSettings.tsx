import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiDelete, invokeFunction } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { MetaConnection } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Instagram, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Bug, User } from "lucide-react";
import { Link } from "react-router-dom";
import type { InstagramAccount } from "./AuthCallback";

interface AuthCallbackState {
  accounts: InstagramAccount[];
  token_expires_at: string;
}

export default function MetaSettingsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<MetaConnection | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [startingOAuth, setStartingOAuth] = useState(false);
  
  // Account selection state
  const [showAccountSelection, setShowAccountSelection] = useState(false);
  const [availableAccounts, setAvailableAccounts] = useState<InstagramAccount[]>([]);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string>("");
  const [selectingAccount, setSelectingAccount] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadConnection();
  }, [user]);

  useEffect(() => {
    // Check if we're returning from OAuth with accounts to select
    const selectAccount = searchParams.get("select_account");
    
    if (selectAccount === "true") {
      const storedData = sessionStorage.getItem("instagram_auth_accounts");
      if (storedData) {
        try {
          const authState: AuthCallbackState = JSON.parse(storedData);
          setAvailableAccounts(authState.accounts);
          setTokenExpiresAt(authState.token_expires_at);
          setShowAccountSelection(true);
          // Clear the URL param
          setSearchParams({});
        } catch (e) {
          console.error("Failed to parse stored accounts:", e);
        }
      }
    }

    // Handle legacy success/error params
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
  }, [searchParams, setSearchParams]);

  const loadConnection = async () => {
    try {
      const data = await apiGet<MetaConnection | null>("/api/settings/meta-connection");
      if (data) setConnection(data);
    } catch (error: unknown) {
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
    
    // Build OAuth URL with dynamic redirect_uri (Facebook Login → IG Business)
    const clientId = "907189555065398";
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/callback`);
    const scopes = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_insights,pages_show_list,pages_read_engagement,business_management";

    const oauthUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes}&response_type=code`;
    
    console.log('Starting OAuth with URL:', oauthUrl);
    window.location.href = oauthUrl;
  };

  const selectAccount = async (account: InstagramAccount) => {
    setSelectingAccount(account.ig_user_id);
    
    try {
      const { data, error: fnError } = await invokeFunction('instagram-auth', {
        body: {
          action: 'select_account',
          selected_account: {
            ...account,
            token_expires_at: tokenExpiresAt
          }
        }
      });

      if (fnError) {
        throw new Error(fnError.message || 'Fehler beim Speichern');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Speichern fehlgeschlagen');
      }

      // Clear stored accounts
      sessionStorage.removeItem("instagram_auth_accounts");
      setShowAccountSelection(false);
      setAvailableAccounts([]);
      
      toast.success(`@${account.ig_username} erfolgreich verbunden!`);
      await loadConnection();
    } catch (err) {
      console.error("Error selecting account:", err);
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
      await apiDelete(`/api/settings/meta-connection/${connection.id}`);

      setConnection(null);
      toast.success("Verbindung getrennt");
    } catch (error: unknown) {
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
        {/* Account Selection Modal/Card */}
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
                Wähle das Instagram-Konto, auf dem du posten möchtest:
              </p>
              
              <div className="grid gap-3">
                {availableAccounts.map((account) => (
                  <button
                    key={account.ig_user_id}
                    onClick={() => selectAccount(account)}
                    disabled={selectingAccount !== null}
                    className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {account.profile_picture_url ? (
                      <img 
                        src={account.profile_picture_url} 
                        alt={account.ig_username}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        @{account.ig_username}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {account.page_name}
                      </p>
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
                <div className="flex gap-3 flex-wrap">
                  <Button variant="outline" onClick={startOAuth} disabled={startingOAuth}>
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