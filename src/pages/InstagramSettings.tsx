import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle, Instagram, Key, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function InstagramSettings() {
  const [igUserId, setIgUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [existingToken, setExistingToken] = useState<{ ig_user_id: string; created_at: string } | null>(null);
  const [isCheckingToken, setIsCheckingToken] = useState(true);

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

  const handleSaveToken = async () => {
    if (!igUserId.trim() || !accessToken.trim()) {
      toast.error('Bitte fülle beide Felder aus');
      return;
    }

    setIsLoading(true);
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
    try {
      const { error } = await supabase
        .from('instagram_tokens')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all for current user (RLS handles filtering)

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
                <span className="text-muted-foreground">Instagram User ID:</span>
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
                onClick={() => setExistingToken(null)}
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
              <Label htmlFor="igUserId">Instagram User ID</Label>
              <Input
                id="igUserId"
                placeholder="z.B. 17841400000000000"
                value={igUserId}
                onChange={(e) => setIgUserId(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Findest du im Meta Developer Dashboard unter "Access Token Debugger"
              </p>
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
              disabled={isLoading || !igUserId.trim() || !accessToken.trim()}
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
                  <li>Füge die Berechtigungen hinzu: instagram_basic, instagram_content_publish</li>
                  <li>Klicke "Generate Access Token"</li>
                </ol>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
