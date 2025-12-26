import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Sliders, Save, Trash2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Settings {
  id: string;
  posts_per_week: number | null;
  preferred_days: string[] | null;
}

interface Profile {
  id: string;
  display_name: string | null;
}

export default function GeneralSettingsTab() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [postsPerWeek, setPostsPerWeek] = useState(3);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const [settingsRes, profileRes] = await Promise.all([
        supabase.from("settings").select("*").single(),
        supabase.from("profiles").select("*").single(),
      ]);

      if (settingsRes.data) {
        setSettings(settingsRes.data as Settings);
        setPostsPerWeek(settingsRes.data.posts_per_week || 3);
      }
      if (profileRes.data) {
        setProfile(profileRes.data as Profile);
        setDisplayName(profileRes.data.display_name || "");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          display_name: displayName || null,
          updated_at: new Date().toISOString(),
        });

      if (profileError) throw profileError;

      // Update settings
      const { error: settingsError } = await supabase
        .from("settings")
        .upsert({
          user_id: user.id,
          posts_per_week: postsPerWeek,
          updated_at: new Date().toISOString(),
        });

      if (settingsError) throw settingsError;

      toast.success("Einstellungen gespeichert");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Fehler";
      toast.error("Speichern fehlgeschlagen: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDrafts = async () => {
    if (!user) return;
    setDeleting(true);

    try {
      // Delete drafts and scheduled posts (but NOT published or imported)
      const { error, count } = await supabase
        .from("posts")
        .delete({ count: "exact" })
        .in("status", ["DRAFT", "IDEA", "READY_FOR_REVIEW", "APPROVED", "SCHEDULED", "FAILED", "REJECTED"])
        .or("is_imported.is.null,is_imported.eq.false");

      if (error) throw error;

      toast.success(`Workspace bereinigt – ${count || 0} Entwürfe gelöscht`);
      
      // Trigger a refetch by dispatching a custom event (Dashboard can listen to this)
      window.dispatchEvent(new CustomEvent("workspace-reset"));
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Fehler";
      toast.error("Löschen fehlgeschlagen: " + msg);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sliders className="h-5 w-5" />
            Profil & Präferenzen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="displayName">Anzeigename</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Dein Name"
              className="glass-input"
            />
            <p className="text-xs text-muted-foreground">
              Wird zur Begrüßung im Cockpit verwendet
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="postsPerWeek">Posts pro Woche</Label>
            <Input
              id="postsPerWeek"
              type="number"
              min={1}
              max={14}
              value={postsPerWeek}
              onChange={(e) => setPostsPerWeek(parseInt(e.target.value) || 3)}
              className="glass-input w-24"
            />
            <p className="text-xs text-muted-foreground">
              Wie viele Posts du wöchentlich veröffentlichen möchtest
            </p>
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Speichern
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="glass-card border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Gefahrenzone
          </CardTitle>
          <CardDescription>
            Aktionen hier können nicht rückgängig gemacht werden
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
            <div>
              <p className="font-medium text-foreground">Workspace bereinigen</p>
              <p className="text-sm text-muted-foreground">
                Löscht alle Entwürfe, geplante und fehlgeschlagene Posts. Veröffentlichte Posts und importierte Historie bleiben erhalten.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="destructive" 
                  className="shrink-0 shadow-[0_0_15px_hsl(var(--destructive)/0.3)]"
                  disabled={deleting}
                >
                  {deleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Alle Entwürfe löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    Bist du sicher?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Dies löscht <strong>alle unveröffentlichten Entwürfe</strong> unwiderruflich. 
                    Deine veröffentlichten Posts und die importierte Instagram-Historie bleiben erhalten.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteDrafts}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Ja, unwiderruflich löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
