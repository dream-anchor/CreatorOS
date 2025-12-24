import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle, Instagram, Key, Shield, Wifi, XCircle, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ConnectionTestResult {
  success: boolean;
  username?: string;
  id?: string;
  media_count?: number;
  error?: string;
  details?: string;
  token_expired?: boolean;
  expected_id?: string;
}

interface TestPostResult {
  success: boolean;
  message?: string;
  error?: string;
  media_id?: string;
}

// Validate IG User ID: must be numeric and start with 178414 (Instagram Business Account prefix)
const validateIgUserId = (id: string): { valid: boolean; error?: string } => {
  const trimmed = id.trim();
  
  if (!trimmed) {
    return { valid: false, error: 'Instagram Business User ID ist erforderlich' };
  }
  
  // Must be numeric
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: 'Die ID muss nur aus Zahlen bestehen' };
  }
  
  // Must start with 178414 (Instagram Business Account IDs start with this)
  if (!trimmed.startsWith('178414') && !trimmed.startsWith('17841')) {
    return { valid: false, error: 'Instagram Business User IDs beginnen mit 17841... – du hast vermutlich die Facebook App ID eingegeben' };
  }
  
  // Reasonable length check (IG IDs are typically 17-18 digits)
  if (trimmed.length < 15 || trimmed.length > 20) {
    return { valid: false, error: 'Die ID sollte 15-20 Ziffern lang sein' };
  }
  
  return { valid: true };
};

export default function InstagramSettings() {
  const [igUserId, setIgUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingPost, setIsTestingPost] = useState(false);
  const [existingToken, setExistingToken] = useState<{ ig_user_id: string; created_at: string } | null>(null);
  const [isCheckingToken, setIsCheckingToken] = useState(true);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testPostResult, setTestPostResult] = useState<TestPostResult | null>(null);
  const [igUserIdError, setIgUserIdError] = useState<string | null>(null);

  useEffect(() => {
    checkExistingToken();
  }, []);

  const checkExistingToken = async () => {
    setIsCheckingToken(true);
    try {
      const { data, error } = await supabase
        .from('instagram_tokens')
        .select('ig_user_id, created_at')
        .maybeSingle();

      if (error) {
        console.error('Error checking token:', error);
      } else if (data) {
        setExistingToken(data);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    } finally {
      setIsCheckingToken(false);
    }
  };

  const handleIgUserIdChange = (value: string) => {
    setIgUserId(value);
    if (value.trim()) {
      const validation = validateIgUserId(value);
      setIgUserIdError(validation.valid ? null : validation.error || null);
    } else {
      setIgUserIdError(null);
    }
  };

  const handleSaveToken = async () => {
    const validation = validateIgUserId(igUserId);
    if (!validation.valid) {
      setIgUserIdError(validation.error || 'Ungültige ID');
      toast.error(validation.error || 'Ungültige Instagram Business User ID');
      return;
    }

    if (!accessToken.trim()) {
      toast.error('Bitte fülle beide Felder aus');
      return;
    }

    setIsLoading(true);
    setTestResult(null);
    setTestPostResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Du bist nicht angemeldet');
        return;
      }

      const response = await supabase.functions.invoke('store-instagram-token', {
        body: {
          ig_user_id: igUserId.trim(),
          access_token: accessToken.trim()
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Fehler beim Speichern');
      }

      toast.success('Instagram Token erfolgreich gespeichert!');
      setAccessToken('');
      setIgUserId('');
      setIgUserIdError(null);
      await checkExistingToken();
    } catch (err) {
      console.error('Error saving token:', err);
      toast.error(err instanceof Error ? err.message : 'Fehler beim Speichern des Tokens');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteToken = async () => {
    setIsLoading(true);
    setTestResult(null);
    setTestPostResult(null);
    try {
      const { error } = await supabase
        .from('instagram_tokens')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) throw error;

      toast.success('Token gelöscht');
      setExistingToken(null);
    } catch (err) {
      console.error('Error deleting token:', err);
      toast.error('Fehler beim Löschen des Tokens');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await supabase.functions.invoke('test-instagram-connection', {
        body: {}
      });

      if (response.error) {
        const errorData = response.error;
        setTestResult({
          success: false,
          error: errorData.message || 'Verbindungstest fehlgeschlagen',
        });
        return;
      }

      const data = response.data as ConnectionTestResult;
      setTestResult(data);

      if (data.success) {
        toast.success(`Verbindung erfolgreich! @${data.username}`);
      }
    } catch (err) {
      console.error('Error testing connection:', err);
      setTestResult({
        success: false,
        error: 'Unerwarteter Fehler beim Testen der Verbindung'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestPost = async () => {
    setIsTestingPost(true);
    setTestPostResult(null);
    try {
      const response = await supabase.functions.invoke('test-instagram-post', {
        body: {}
      });

      if (response.error) {
        setTestPostResult({
          success: false,
          error: response.error.message || 'Test-Post fehlgeschlagen',
        });
        return;
      }

      const data = response.data as TestPostResult;
      setTestPostResult(data);

      if (data.success) {
        toast.success('Test-Post erfolgreich veröffentlicht!');
      } else {
        toast.error(data.error || 'Test-Post fehlgeschlagen');
      }
    } catch (err) {
      console.error('Error testing post:', err);
      setTestPostResult({
        success: false,
        error: 'Unerwarteter Fehler beim Test-Post'
      });
    } finally {
      setIsTestingPost(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Instagram className="h-8 w-8" />
          Instagram Einstellungen
        </h1>
        <p className="text-muted-foreground mt-2">
          Verwalte deinen Instagram API Zugang für automatisches Posten
        </p>
      </div>

      <Alert className="mb-6">
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Dein Access Token wird sicher auf dem Server gespeichert und niemals im Browser.
        </AlertDescription>
      </Alert>

      {isCheckingToken ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </CardContent>
        </Card>
      ) : existingToken ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Token aktiv
              </CardTitle>
              <CardDescription>
                Ein Instagram Token ist bereits konfiguriert
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Instagram Business User ID:</span>
                  <span className="font-mono">{existingToken.ig_user_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gespeichert am:</span>
                  <span>{new Date(existingToken.created_at).toLocaleDateString('de-DE')}</span>
                </div>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setExistingToken(null);
                    setTestResult(null);
                    setTestPostResult(null);
                  }}
                  className="flex-1"
                >
                  Token aktualisieren
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteToken}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Löschen'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Connection Test Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wifi className="h-5 w-5" />
                Verbindung testen
              </CardTitle>
              <CardDescription>
                Überprüfe, ob dein Token funktioniert und die Instagram API erreichbar ist
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                onClick={handleTestConnection}
                disabled={isTesting}
                className="w-full"
                variant="secondary"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Teste Verbindung...
                  </>
                ) : (
                  <>
                    <Wifi className="mr-2 h-4 w-4" />
                    Instagram Verbindung testen
                  </>
                )}
              </Button>

              {/* Test Result Display */}
              {testResult && (
                testResult.success ? (
                  <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-700 dark:text-green-400">
                      Verbindung erfolgreich!
                    </AlertTitle>
                    <AlertDescription className="text-green-600 dark:text-green-300">
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between">
                          <span>Username:</span>
                          <span className="font-semibold">@{testResult.username}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Instagram Business User ID:</span>
                          <span className="font-mono text-sm">{testResult.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Letzte Medien abgerufen:</span>
                          <span>{testResult.media_count} Posts</span>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>
                      {testResult.token_expired ? 'Token abgelaufen' : 'Verbindung fehlgeschlagen'}
                    </AlertTitle>
                    <AlertDescription>
                      <div className="mt-2 space-y-2">
                        <p>{testResult.error}</p>
                        {testResult.details && (
                          <p className="text-sm opacity-80">{testResult.details}</p>
                        )}
                        {testResult.expected_id && (
                          <p className="text-sm">
                            <strong>Erwartete ID:</strong>{' '}
                            <code className="bg-destructive/20 px-1 rounded">{testResult.expected_id}</code>
                          </p>
                        )}
                        {testResult.token_expired && (
                          <div className="mt-3 flex items-center gap-2 text-sm">
                            <RefreshCw className="h-4 w-4" />
                            <span>Bitte generiere einen neuen Token im Meta Developer Dashboard und aktualisiere ihn hier.</span>
                          </div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )
              )}
            </CardContent>
          </Card>

          {/* Test Post Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Test-Post veröffentlichen
              </CardTitle>
              <CardDescription>
                Veröffentliche einen Test-Post um die Publish-Berechtigungen zu prüfen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="bg-muted/30">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Dies erstellt einen echten Post auf deinem Instagram-Account mit dem Text "Test from PostPro ✨".
                </AlertDescription>
              </Alert>

              <Button 
                onClick={handleTestPost}
                disabled={isTestingPost}
                className="w-full"
                variant="default"
              >
                {isTestingPost ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Veröffentliche Test-Post...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Test-Post veröffentlichen
                  </>
                )}
              </Button>

              {/* Test Post Result Display */}
              {testPostResult && (
                testPostResult.success ? (
                  <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-700 dark:text-green-400">
                      Test-Post erfolgreich!
                    </AlertTitle>
                    <AlertDescription className="text-green-600 dark:text-green-300">
                      <div className="mt-2 space-y-1">
                        <p>{testPostResult.message}</p>
                        {testPostResult.media_id && (
                          <div className="flex justify-between">
                            <span>Media ID:</span>
                            <span className="font-mono text-sm">{testPostResult.media_id}</span>
                          </div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Test-Post fehlgeschlagen</AlertTitle>
                    <AlertDescription>
                      <p className="mt-2">{testPostResult.error}</p>
                    </AlertDescription>
                  </Alert>
                )
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Access Token hinzufügen
            </CardTitle>
            <CardDescription>
              Kopiere den Token aus dem Meta Developer Dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="igUserId">Instagram Business User ID</Label>
              <Input
                id="igUserId"
                placeholder="z.B. 17841400000000000"
                value={igUserId}
                onChange={(e) => handleIgUserIdChange(e.target.value)}
                disabled={isLoading}
                className={igUserIdError ? 'border-destructive' : ''}
              />
              {igUserIdError ? (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  {igUserIdError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Diese ID ist <strong>numerisch</strong> und beginnt mit <code className="bg-muted px-1 rounded">17841...</code> – <strong>NICHT</strong> die Facebook App-ID (1116...).
                  Findest du im Access Token Debugger oder über die Graph API.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessToken">Access Token</Label>
              <Input
                id="accessToken"
                type="password"
                placeholder="Dein generierter Access Token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Generiere einen Token im Meta Developer Dashboard → Graph API Explorer
              </p>
            </div>

            <Button 
              onClick={handleSaveToken} 
              disabled={isLoading || !igUserId.trim() || !accessToken.trim() || !!igUserIdError}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Speichere...
                </>
              ) : (
                'Token speichern'
              )}
            </Button>

            <Alert variant="default" className="bg-muted/30">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>So bekommst du den Token:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Gehe zu developers.facebook.com</li>
                  <li>Öffne deine App → Graph API Explorer</li>
                  <li>Wähle deine App und Page aus</li>
                  <li>Füge die Berechtigungen hinzu: <code className="bg-muted px-1 rounded text-xs">instagram_business_basic</code>, <code className="bg-muted px-1 rounded text-xs">instagram_business_content_publish</code>, <code className="bg-muted px-1 rounded text-xs">instagram_business_manage_comments</code></li>
                  <li>Klicke "Generate Access Token"</li>
                  <li>Nutze den Access Token Debugger um deine <strong>Instagram Business User ID</strong> (17841...) zu finden</li>
                </ol>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
