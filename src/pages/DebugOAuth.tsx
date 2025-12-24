import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bug, CheckCircle, XCircle, RefreshCw, Server, ExternalLink } from 'lucide-react';

interface OAuthDebugInfo {
  meta_app_id: string;
  meta_oauth_mode: string;
  meta_oauth_mode_raw: string;
  redirect_uri: string;
  scopes: string[];
  auth_base_url: string;
  timestamp: string;
}

export default function DebugOAuth() {
  const [isLoading, setIsLoading] = useState(true);
  const [debugInfo, setDebugInfo] = useState<OAuthDebugInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDebugInfo = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // We intentionally call the endpoint without a user JWT to avoid "Invalid JWT" failures
      // when sessions are stale. This endpoint only returns non-sensitive config.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

      if (!supabaseUrl || !apikey) {
        throw new Error('Backend not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY)');
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

  useEffect(() => {
    fetchDebugInfo();
  }, []);

  return (
    <div className="container mx-auto py-8 px-4 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Bug className="h-8 w-8" />
          OAuth Debug
        </h1>
        <p className="text-muted-foreground mt-2">
          Server-seitige OAuth Konfiguration überprüfen
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Meta OAuth Konfiguration
          </CardTitle>
          <CardDescription>
            Diese Daten kommen direkt vom Server (keine Secrets werden angezeigt)
          </CardDescription>
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
                <Badge variant="outline">
                  {debugInfo.meta_oauth_mode}
                </Badge>
              </div>

              {/* Auth Base URL */}
              <div className="p-4 rounded-lg border">
                <p className="font-medium mb-2">Auth Base URL</p>
                <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">
                  {debugInfo.auth_base_url}
                </code>
              </div>

              {/* Redirect URI */}
              <div className="p-4 rounded-lg border">
                <p className="font-medium mb-2">Redirect URI</p>
                <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">
                  {debugInfo.redirect_uri}
                </code>
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
                <p className="text-xs text-muted-foreground mt-3">
                  Diese Scopes müssen in der Meta App unter "Permissions" aktiviert sein
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
                    <li>Überprüfe, ob die META_APP_ID zur richtigen App gehört</li>
                    <li>Stelle sicher, dass der Use Case „Instagram Graph API“ aktiviert ist</li>
                    <li>
                      Aktiviere die benötigten Berechtigungen:{' '}
                      <code>instagram_business_basic</code>, <code>instagram_business_content_publish</code>,{' '}
                      <code>instagram_business_manage_comments</code>, <code>instagram_business_manage_messages</code>,{' '}
                      <code>instagram_business_manage_insights</code>, <code>pages_show_list</code>,{' '}
                      <code>pages_read_engagement</code>, <code>business_management</code>
                    </li>
                    <li>Falls du eine „Instagram App“ statt „Facebook App“ verwendest, setze META_OAUTH_MODE=instagram_app</li>
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
    </div>
  );
}
