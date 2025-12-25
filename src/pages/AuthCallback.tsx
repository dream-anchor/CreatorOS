import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      if (error) {
        console.error('[AuthCallback] OAuth error:', error, errorDescription);
        setStatus('error');
        setErrorMessage(errorDescription || error);
        toast.error(`Verbindungsfehler: ${errorDescription || error}`);
        setTimeout(() => navigate('/settings/meta'), 3000);
        return;
      }

      if (!code) {
        console.error('[AuthCallback] No code parameter found');
        setStatus('error');
        setErrorMessage('Kein Autorisierungscode erhalten');
        toast.error('Kein Autorisierungscode erhalten');
        setTimeout(() => navigate('/settings/meta'), 3000);
        return;
      }

      try {
        // Dynamic redirect_uri based on current origin
        const redirectUri = `${window.location.origin}/auth/callback`;
        
        console.log('[AuthCallback] Exchanging code for token...');
        console.log('[AuthCallback] redirect_uri:', redirectUri);

        const response = await supabase.functions.invoke('instagram-auth', {
          body: { 
            code,
            redirect_uri: redirectUri
          }
        });

        if (response.error) {
          console.error('[AuthCallback] Edge function error:', response.error);
          throw new Error(response.error.message || 'Fehler bei der Authentifizierung');
        }

        const data = response.data as any;
        
        if (!data.success) {
          console.error('[AuthCallback] Auth failed:', data);
          throw new Error(data.error || 'Verbindung fehlgeschlagen');
        }

        console.log('[AuthCallback] Successfully connected:', data);
        toast.success('Instagram erfolgreich verbunden!');
        navigate('/dashboard');
      } catch (err) {
        console.error('[AuthCallback] Error:', err);
        setStatus('error');
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setErrorMessage(message);
        toast.error(`Fehler: ${message}`);
        setTimeout(() => navigate('/settings/meta'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="text-center space-y-4">
        {status === 'loading' ? (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h1 className="text-2xl font-semibold text-foreground">
              Verbinde mit Instagram...
            </h1>
            <p className="text-muted-foreground">
              Bitte warten Sie, während wir Ihre Verbindung einrichten.
            </p>
          </>
        ) : (
          <>
            <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
              <span className="text-destructive text-2xl">✕</span>
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Verbindung fehlgeschlagen
            </h1>
            <p className="text-muted-foreground max-w-md">
              {errorMessage}
            </p>
            <p className="text-sm text-muted-foreground">
              Sie werden in Kürze weitergeleitet...
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallback;
