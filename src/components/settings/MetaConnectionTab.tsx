import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MetaConnection } from "@/types/database";
import { toast } from "sonner";
import { 
  Loader2, Instagram, CheckCircle2, AlertCircle, ExternalLink, 
  RefreshCw, User, Download, Sparkles, TrendingUp, Heart, MessageSquare 
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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

interface ImportResult {
  success: boolean;
  imported: number;
  pages_fetched: number;
  unicorn_count: number;
  top_score_threshold: number;
  best_performer?: {
    caption_preview: string;
    likes: number;
    comments: number;
    score: number;
    image_url?: string;
  };
  message: string;
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

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState(0);

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

  const startDeepImport = async () => {
    if (!connection) {
      toast.error("Bitte zuerst Instagram verbinden");
      return;
    }

    setImporting(true);
    setImportResult(null);
    setImportProgress(10);

    // Simulate progress while waiting
    const progressInterval = setInterval(() => {
      setImportProgress(prev => Math.min(prev + 5, 90));
    }, 2000);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-instagram-history', {});

      clearInterval(progressInterval);
      setImportProgress(100);

      if (error) throw error;
      
      const result = data as ImportResult;
      setImportResult(result);
      
      if (result.success) {
        toast.success(`${result.imported} Posts importiert! ${result.unicorn_count} Top-Performer gefunden.`);
      }
    } catch (err) {
      clearInterval(progressInterval);
      const message = err instanceof Error ? err.message : 'Import fehlgeschlagen';
      toast.error(message);
    } finally {
      setImporting(false);
      setTimeout(() => setImportProgress(0), 2000);
    }
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
              <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div className="flex-1">
                  <p className="font-medium text-green-500">Verbunden</p>
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
              <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                <AlertCircle className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="font-medium text-yellow-500">Token abgelaufen</p>
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

      {/* Deep Import Card */}
      {isConnected && !isExpired && (
        <Card className="glass-card border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Archiv-Import
            </CardTitle>
            <CardDescription>
              Importiere deine komplette Instagram-Historie für die Remix-Funktion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {importing && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm">Analysiere Historie... (kann bis zu 1 Min dauern)</span>
                </div>
                <Progress value={importProgress} className="h-2" />
              </div>
            )}

            {importResult && importResult.success && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div className="flex-1">
                    <p className="font-medium text-green-500">Import erfolgreich!</p>
                    <p className="text-sm text-muted-foreground">{importResult.message}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-muted/50 border border-border text-center">
                    <p className="text-2xl font-bold text-primary">{importResult.imported}</p>
                    <p className="text-xs text-muted-foreground">Posts importiert</p>
                  </div>
                  <div className="p-4 rounded-xl bg-gradient-to-br from-orange-500/10 to-pink-500/10 border border-orange-500/20 text-center">
                    <p className="text-2xl font-bold text-orange-500">{importResult.unicorn_count}</p>
                    <p className="text-xs text-muted-foreground">Top 1% Unicorns</p>
                  </div>
                </div>

                {importResult.best_performer && (
                  <div className="p-4 rounded-xl bg-muted/30 border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Dein Top-Performer:</span>
                      <Badge variant="secondary" className="bg-orange-500/10 text-orange-500">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Score: {importResult.best_performer.score}
                      </Badge>
                    </div>
                    <div className="flex gap-4">
                      {importResult.best_performer.image_url && (
                        <img 
                          src={importResult.best_performer.image_url} 
                          alt="Top Post" 
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-clamp-2 text-muted-foreground">
                          {importResult.best_performer.caption_preview}
                        </p>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" /> {importResult.best_performer.likes}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> {importResult.best_performer.comments}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button 
              onClick={startDeepImport} 
              disabled={importing}
              className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
            >
              {importing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importiere...</>
              ) : (
                <><Download className="mr-2 h-4 w-4" />📥 Komplettes Archiv importieren</>
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Importiert bis zu 1.000 Posts mit Engagement-Daten für die Remix-Funktion
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
