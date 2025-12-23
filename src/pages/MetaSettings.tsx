import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MetaConnection } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Instagram, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";

export default function MetaSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<MetaConnection | null>(null);

  useEffect(() => {
    if (user) loadConnection();
  }, [user]);

  const loadConnection = async () => {
    try {
      const { data, error } = await supabase
        .from("meta_connections")
        .select("id, user_id, page_id, page_name, ig_user_id, ig_username, token_expires_at, connected_at, updated_at")
        .single();

      if (error && error.code !== "PGRST116") throw error;
      if (data) setConnection(data as MetaConnection);
    } catch (error: any) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
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
              <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/30">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <div>
                  <p className="font-medium text-success">Verbunden</p>
                  <p className="text-sm text-muted-foreground">
                    @{connection?.ig_username || connection?.ig_user_id} • {connection?.page_name}
                  </p>
                </div>
              </div>
            ) : isExpired ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/30">
                <AlertCircle className="h-5 w-5 text-warning" />
                <div>
                  <p className="font-medium text-warning">Token abgelaufen</p>
                  <p className="text-sm text-muted-foreground">Bitte erneut verbinden</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted border border-border">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <p className="text-muted-foreground">Nicht verbunden</p>
              </div>
            )}

            <div className="space-y-3 pt-4">
              <h4 className="font-medium">Voraussetzungen:</h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary">1.</span>
                  Instagram Professional-Konto (Business oder Creator)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">2.</span>
                  Mit einer Facebook Page verknüpft
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">3.</span>
                  Meta Developer App mit Instagram Graph API Zugriff
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground mb-4">
                Die Meta OAuth-Integration erfordert eine konfigurierte Meta Developer App. 
                Folge der README für Setup-Anweisungen.
              </p>
              <Button variant="outline" asChild>
                <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Meta Developer Portal
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
