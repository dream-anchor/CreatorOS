import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Image as ImageIcon,
  Trash2,
  Plus,
  FolderOpen,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface ContentSnippet {
  id: string;
  user_id: string;
  storage_path: string;
  public_url: string | null;
  title: string | null;
  category: string | null;
  used_count: number;
  last_used_at: string | null;
  created_at: string;
}

export default function ContentLibraryPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [snippets, setSnippets] = useState<ContentSnippet[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadSnippets();
  }, [user]);

  const loadSnippets = async () => {
    try {
      const { data, error } = await supabase
        .from("content_snippets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSnippets((data as ContentSnippet[]) || []);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    if (files.length > 0) {
      setDialogOpen(true);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);

    try {
      for (const file of selectedFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${user!.id}/snippets/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("post-assets")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("post-assets")
          .getPublicUrl(fileName);

        const { error: insertError } = await supabase.from("content_snippets").insert({
          user_id: user!.id,
          storage_path: fileName,
          public_url: urlData.publicUrl,
          title: file.name.replace(/\.[^/.]+$/, ""),
          category: category || null,
        });

        if (insertError) throw insertError;
      }

      toast.success(`${selectedFiles.length} Bild(er) hochgeladen!`);
      setDialogOpen(false);
      setSelectedFiles([]);
      setCategory("");
      loadSnippets();
    } catch (error: any) {
      toast.error("Upload fehlgeschlagen: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (snippet: ContentSnippet) => {
    setDeleting(snippet.id);
    try {
      // Delete from storage
      await supabase.storage.from("post-assets").remove([snippet.storage_path]);

      // Delete from database
      const { error } = await supabase
        .from("content_snippets")
        .delete()
        .eq("id", snippet.id);

      if (error) throw error;

      toast.success("Bild gelöscht");
      loadSnippets();
    } catch (error: any) {
      toast.error("Löschen fehlgeschlagen: " + error.message);
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Content-Bibliothek">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Content-Bibliothek"
      description="Dein Pool an zeitlosen Bildern für den Autopilot"
      actions={
        <Button
          onClick={() => document.getElementById("multi-file-upload")?.click()}
          className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/80 hover:to-cyan-500/80"
        >
          <Plus className="mr-2 h-4 w-4" />
          Bilder hinzufügen
        </Button>
      }
    >
      <input
        id="multi-file-upload"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {snippets.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center mb-6">
              <FolderOpen className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Deine Content-Bibliothek ist leer
            </h2>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Lade zeitlose Fotos hoch (Porträts, Set-Fotos, etc.). Der Autopilot nutzt sie automatisch für neue Posts.
            </p>
            <Button
              onClick={() => document.getElementById("multi-file-upload")?.click()}
              size="lg"
              className="bg-gradient-to-r from-primary to-cyan-500"
            >
              <Upload className="mr-2 h-5 w-5" />
              Erste Bilder hochladen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="flex gap-4">
            <div className="glass-card px-4 py-3 rounded-xl">
              <p className="text-2xl font-bold text-foreground">{snippets.length}</p>
              <p className="text-sm text-muted-foreground">Bilder gesamt</p>
            </div>
            <div className="glass-card px-4 py-3 rounded-xl">
              <p className="text-2xl font-bold text-foreground">
                {snippets.filter(s => s.used_count === 0).length}
              </p>
              <p className="text-sm text-muted-foreground">Unbenutzt</p>
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {snippets.map((snippet) => (
              <Card
                key={snippet.id}
                className={cn(
                  "glass-card overflow-hidden group relative",
                  snippet.used_count === 0 && "ring-2 ring-primary/30"
                )}
              >
                <CardContent className="p-0">
                  <div className="aspect-square relative">
                    {snippet.public_url ? (
                      <img
                        src={snippet.public_url}
                        alt={snippet.title || "Content"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}

                    {/* Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(snippet)}
                        disabled={deleting === snippet.id}
                      >
                        {deleting === snippet.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {/* Used badge */}
                    {snippet.used_count > 0 && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs">
                        {snippet.used_count}× genutzt
                      </div>
                    )}

                    {/* Unused badge */}
                    {snippet.used_count === 0 && (
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-primary text-white text-xs">
                        Neu
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <p className="text-sm font-medium text-foreground truncate">
                      {snippet.title || "Unbenannt"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(snippet.created_at), "dd. MMM yyyy", { locale: de })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bilder hochladen</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selectedFiles.length} Bild(er) ausgewählt
            </p>

            <div className="grid grid-cols-4 gap-2">
              {selectedFiles.slice(0, 8).map((file, i) => (
                <div key={i} className="aspect-square rounded-lg overflow-hidden bg-muted">
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
              {selectedFiles.length > 8 && (
                <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                  <span className="text-sm text-muted-foreground">
                    +{selectedFiles.length - 8}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Kategorie (optional)</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="z.B. Porträts, Set-Fotos, Lifestyle"
                className="glass-input"
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                Abbrechen
              </Button>
              <Button onClick={handleUpload} disabled={uploading} className="flex-1">
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Hochladen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
