import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { invokeFunction } from "@/lib/api";
import { toast } from "sonner";
import {
  RefreshCw,
  Wrench,
  Database,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SystemStatusTab() {
  const [forceResyncing, setForceResyncing] = useState(false);
  const [repairingMetadata, setRepairingMetadata] = useState(false);

  const forceResyncFeed = async () => {
    setForceResyncing(true);
    toast.info("🔧 Lade letzte 20 Posts direkt von Instagram...");

    try {
      const { data, error } = await invokeFunction("fetch-instagram-history", {
        body: { mode: "force_resync" },
      });

      if (error) {
        const errorMessage = error.message || "Unbekannter Fehler";
        toast.error(`❌ Feed-Reparatur fehlgeschlagen: ${errorMessage}`);
        console.error("Force resync error:", error);
        return;
      }

      if (!data?.success) {
        const errorCode = data?.error_code || "Unbekannt";
        const errorMsg = data?.message || data?.error || "Unbekannter API-Fehler";
        toast.error(`❌ API-Fehler (${errorCode}): ${errorMsg}`, { duration: 8000 });
        console.error("Force resync API error:", data);
        return;
      }

      toast.success(`✅ ${data.synced} Posts repariert & aktualisiert!`);
    } catch (err) {
      console.error("Force resync exception:", err);
      const message = err instanceof Error ? err.message : "Netzwerkfehler";
      toast.error(`❌ Verbindungsfehler: ${message}`);
    } finally {
      setForceResyncing(false);
    }
  };

  const repairPostMetadata = async () => {
    setRepairingMetadata(true);
    toast.info("🔧 Repariere Post-Metadaten...");

    try {
      const { data, error } = await invokeFunction("repair-post-metadata");

      if (error) {
        toast.error(`❌ Metadaten-Reparatur fehlgeschlagen: ${error.message}`);
        return;
      }

      if (data?.success) {
        toast.success(`✅ ${data.repaired || 0} Posts repariert!`);
      } else {
        toast.error("Reparatur fehlgeschlagen");
      }
    } catch (err) {
      console.error("Repair metadata error:", err);
      toast.error("Fehler bei der Metadaten-Reparatur");
    } finally {
      setRepairingMetadata(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            System-Status
          </CardTitle>
          <CardDescription>
            Übersicht über den Synchronisierungsstatus und Reparatur-Werkzeuge
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3 bg-success/10 text-success border-success/30">
              <CheckCircle2 className="h-3.5 w-3.5" />
              System aktiv
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Repair Tools */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Reparatur-Werkzeuge
          </CardTitle>
          <CardDescription>
            Werkzeuge zur Behebung von Synchronisierungsproblemen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Force Resync */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-muted/50 border border-border">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Feed Reparatur</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Lädt die letzten 20 Posts direkt von Instagram und überschreibt lokale Daten. 
                Nützlich bei fehlenden Bildern oder veralteten Daten.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={forceResyncFeed}
              disabled={forceResyncing}
              className="shrink-0"
            >
              {forceResyncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Läuft...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reparieren
                </>
              )}
            </Button>
          </div>

          {/* Metadata Repair */}
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-muted/50 border border-border">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Metadaten Sync</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Aktualisiert fehlende Metadaten wie Engagement-Statistiken, 
                Kategorien und Medien-URLs für alle Posts.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={repairPostMetadata}
              disabled={repairingMetadata}
              className="shrink-0"
            >
              {repairingMetadata ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Läuft...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Synchronisieren
                </>
              )}
            </Button>
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Diese Werkzeuge sollten nur bei Problemen verwendet werden. 
              Die automatische Synchronisierung erfolgt im Hintergrund.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
