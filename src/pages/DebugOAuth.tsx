import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Bug, CheckCircle, XCircle, RefreshCw, Server, ExternalLink, Link as LinkIcon, Copy } from 'lucide-react';

interface OAuthDebugInfo {
  meta_app_id: string;
  meta_oauth_mode: string;
  meta_oauth_mode_raw: string;
  redirect_uri: string;
  scopes: string[];
  scope_param?: string;
  auth_base_url: string;
  auth_url?: string; // debug preview URL (state=debug)
  timestamp: string;
}

interface OAuthFinalInfo {
  auth_url: string;
  scopes: string[];
  meta_oauth_mode: string;
}

export default function DebugOAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<OAuthDebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [finalLoading, setFinalLoading] = useState(false);
  const [finalInfo, setFinalInfo] = useState<OAuthFinalInfo | null>(null);

  const supabaseUrl = useMemo(() => import.meta.env.VITE_SUPABASE_URL as string | undefined, []);
  const apikey = useMemo(() => import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined, []);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('In Zwischenablage kopiert');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  const fetchDebugInfo = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Intentionally WITHOUT user JWT: endpoint only returns non-sensitive config.
      if (!supabaseUrl || !apikey) {
        throw new Error('Backend nicht konfiguriert (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY fehlt)');
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/meta-oauth-config`, {
        method: 'GET',
        headers: {
          apikey,
          'Content-Type': 'application/json',
        },
      });

      const data = (await res.json()) as unknown;

      if (!res.ok) {
        const msg = (data as any)?.error || (data as any)?.message || `Request failed (${res.status})`;
        throw new Error(msg);
      }

      setDebugInfo(data as OAuthDebugInfo);
    } catch (err) {
      console.error('Error fetching debug info:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch debug info');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFinalAuthorizeUrl = async () => {
    setFinalLoading(true);
    try {
      const res = await supabase.functions.invoke('meta-oauth-config', { body: {} });
      if (res.error) throw new Error(res.error.message || 'Fehler beim Abrufen der finalen OAuth URL');
      const data = res.data as any;
      if (!data?.auth_url) throw new Error('Keine auth_url erhalten');

      setFinalInfo({
        auth_url: data.auth_url as string,
        scopes: (data.scopes as string[]) ?? [],
        meta_oauth_mode: (data.meta_oauth_mode as string) ?? '',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      toast.error(msg);
    } finally {
      setFinalLoading(false);
    }
  };

  useEffect(() => {
    fetchDebugInfo();
  }, []);

  return (
    <AppLayout title="OAuth Debug" description="Finale Authorize-URL und Scopes prüfen">
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Meta OAuth Konfiguration
            </CardTitle>
            <CardDescription>Diese Daten kommen direkt vom Server (keine Secrets werden angezeigt)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={fetchDebugInfo} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Aktualisieren
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Fehler</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : debugInfo ? (
              <div className="space-y-4">
                {/* App ID */}
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">META_APP_ID</p>
                    <p className="text-sm text-muted-foreground font-mono break-all">
                      {debugInfo.meta_app_id || 'Nicht konfiguriert'}
                    </p>
                  </div>
                  <Badge variant={debugInfo.meta_app_id ? 'default' : 'destructive'}>
                    {debugInfo.meta_app_id ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Konfiguriert
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3 w-3 mr-1" />
                        Fehlt
                      </>
                    )}
                  </Badge>
                </div>

                {/* OAuth Mode */}
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">META_OAUTH_MODE</p>
                    <p className="text-sm text-muted-foreground">
                      {debugInfo.meta_oauth_mode === 'instagram_app'
                        ? 'Instagram App (Instagram Login Flow)'
                        : 'Facebook App (Facebook Login for Business)'}
                    </p>
                  </div>
                  <Badge variant="outline">{debugInfo.meta_oauth_mode}</Badge>
                </div>

                {/* Auth Base URL */}
                <div className="p-4 rounded-lg border">
                  <p className="font-medium mb-2">Auth Base URL</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">{debugInfo.auth_base_url}</code>
                </div>

                {/* Redirect URI */}
                <div className="p-4 rounded-lg border">
                  <p className="font-medium mb-2">Redirect URI</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">{debugInfo.redirect_uri}</code>
                  <p className="text-xs text-muted-foreground mt-2">
                    Diese URL muss in der Meta App als "Valid OAuth Redirect URIs" eingetragen sein
                  </p>
                </div>

                {/* Scopes */}
                <div className="p-4 rounded-lg border">
                  <p className="font-medium mb-3">Scopes (Berechtigungen)</p>
                  <div className="flex flex-wrap gap-2">
                    {debugInfo.scopes.map((scope) => (
                      <Badge key={scope} variant="secondary" className="font-mono text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Debug Authorize URL */}
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">Authorize URL (Debug)</p>
                    <div className="flex items-center gap-2">
                      {debugInfo.auth_url && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(debugInfo.auth_url!)}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Kopieren
                          </Button>
                          <Button type="button" variant="outline" size="sm" asChild>
                            <a href={debugInfo.auth_url} target="_blank" rel="noopener noreferrer">
                              <LinkIcon className="h-4 w-4 mr-2" />
                              Öffnen
                            </a>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto mt-2">
                    {debugInfo.auth_url || 'Nicht verfügbar'}
                  </code>
                  <p className="text-xs text-muted-foreground mt-2">
                    Hinweis: Debug-URL nutzt <code className="font-mono">state=debug</code> (nur zur Prüfung der Scopes).
                  </p>
                </div>

                {/* Timestamp */}
                <div className="text-xs text-muted-foreground text-right">
                  Abgerufen: {new Date(debugInfo.timestamp).toLocaleString('de-DE')}
                </div>

                {/* Troubleshooting */}
                <Alert>
                  <Bug className="h-4 w-4" />
                  <AlertTitle>Fehlerbehebung "Invalid Scopes"</AlertTitle>
                  <AlertDescription className="mt-2">
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      <li>Stelle sicher, dass du in der Meta App den Use Case „Instagram Graph API“ aktiviert hast</li>
                      <li>
                        Aktiviere exakt diese Berechtigungen:{' '}
                        <code>instagram_business_basic</code>, <code>instagram_business_content_publish</code>,{' '}
                        <code>instagram_business_manage_comments</code>, <code>instagram_business_manage_messages</code>,{' '}
                        <code>instagram_business_manage_insights</code>, <code>pages_show_list</code>,{' '}
                        <code>pages_read_engagement</code>, <code>business_management</code>
                      </li>
                      <li>
                        Prüfe die oben ausgegebene Authorize URL: sie darf <strong>nicht</strong> <code>instagram_basic</code> oder{' '}
                        <code>instagram_content_publish</code> enthalten.
                      </li>
                    </ol>
                  </AlertDescription>
                </Alert>

                <Button variant="outline" className="w-full" asChild>
                  <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Meta Developer Portal öffnen
                  </a>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5" />
              Finale Authorize URL (für deinen Account)
            </CardTitle>
            <CardDescription>
              Diese URL kommt aus dem gleichen Endpoint wie der echte Login-Flow (inkl. state=user_id).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={fetchFinalAuthorizeUrl} disabled={finalLoading}>
              {finalLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bug className="mr-2 h-4 w-4" />}
              Finale URL abrufen
            </Button>

            {finalInfo && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {finalInfo.scopes.map((s) => (
                    <Badge key={s} variant="secondary" className="font-mono text-xs">
                      {s}
                    </Badge>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => copyToClipboard(finalInfo.auth_url)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Kopieren
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={finalInfo.auth_url} target="_blank" rel="noopener noreferrer">
                      <LinkIcon className="h-4 w-4 mr-2" />
                      Öffnen
                    </a>
                  </Button>
                </div>

                <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">{finalInfo.auth_url}</code>

                <p className="text-xs text-muted-foreground">
                  Mode: <code className="font-mono">{finalInfo.meta_oauth_mode}</code>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

