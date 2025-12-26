import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Tag,
  X,
  Sparkles,
  Wand2,
  CheckCircle,
  Eye,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface MediaAsset {
  id: string;
  user_id: string;
  storage_path: string;
  public_url: string | null;
  filename: string | null;
  tags: string[];
  description: string | null;
  mood: string | null;
  used_count: number;
  last_used_at: string | null;
  created_at: string;
  is_reference: boolean | null;
  is_selfie: boolean | null;
  ai_tags: string[] | null;
  ai_description: string | null;
  analyzed: boolean | null;
  is_good_reference: boolean | null;
}

interface UploadingAsset {
  id: string;
  filename: string;
  public_url: string;
  analyzing: boolean;
}

const SUGGESTED_TAGS = [
  "Portrait",
  "Set",
  "Behind the Scenes",
  "Lifestyle",
  "Outdoor",
  "Studio",
  "Mood",
  "Urlaub",
  "Event",
  "Produkt",
];

const MOODS = [
  "Energetisch",
  "Nachdenklich",
  "Fröhlich",
  "Mysteriös",
  "Professionell",
  "Entspannt",
  "Dramatisch",
];

export default function MediaArchivePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [mood, setMood] = useState("");
  const [description, setDescription] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [togglingReference, setTogglingReference] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [viewingAsset, setViewingAsset] = useState<MediaAsset | null>(null);
  const [uploadingAssets, setUploadingAssets] = useState<UploadingAsset[]>([]);

  useEffect(() => {
    if (user) loadAssets();
  }, [user]);

  const loadAssets = async () => {
    try {
      const { data, error } = await supabase
        .from("media_assets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAssets((data as MediaAsset[]) || []);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) {
      setSelectedFiles(files);
      setDialogOpen(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    if (files.length > 0) {
      setDialogOpen(true);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    if (customTag && !selectedTags.includes(customTag)) {
      setSelectedTags([...selectedTags, customTag]);
      setCustomTag("");
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    resetDialog();

    const uploadedAssets: UploadingAsset[] = [];

    try {
      for (const file of selectedFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${user!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("media-archive")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("media-archive")
          .getPublicUrl(fileName);

        const { data: insertData, error: insertError } = await supabase
          .from("media_assets")
          .insert({
            user_id: user!.id,
            storage_path: fileName,
            public_url: urlData.publicUrl,
            filename: file.name,
            tags: [],
            analyzed: false,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;

        uploadedAssets.push({
          id: insertData.id,
          filename: file.name,
          public_url: urlData.publicUrl,
          analyzing: true,
        });
      }

      // Add to uploading state for visual feedback
      setUploadingAssets(uploadedAssets);
      toast.success(`${uploadedAssets.length} Bild(er) hochgeladen! ✨ KI analysiert...`);
      loadAssets();

      // Auto-analyze each uploaded asset
      let successCount = 0;
      let failCount = 0;
      
      for (const asset of uploadedAssets) {
        try {
          const { data, error } = await supabase.functions.invoke("analyze-media-vision", {
            body: { 
              mode: "auto", 
              asset_id: asset.id,
              image_url: asset.public_url 
            }
          });

          if (error) {
            console.error(`Analysis error for ${asset.id}:`, error);
            toast.error(`Analyse-Fehler: ${error.message || "Unbekannt"}`);
            failCount++;
          } else if (data && !data.success) {
            console.error(`Analysis failed for ${asset.id}:`, data.error);
            toast.error(`Analyse fehlgeschlagen: ${data.error || "Unbekannter Fehler"}`);
            failCount++;
          } else {
            successCount++;
          }

          // Mark as done
          setUploadingAssets(prev => 
            prev.map(a => a.id === asset.id ? { ...a, analyzing: false } : a)
          );
        } catch (error: any) {
          console.error(`Auto-analysis exception for ${asset.id}:`, error);
          toast.error(`Analyse-Exception: ${error.message || "Netzwerkfehler"}`);
          failCount++;
        }
      }

      // Clear uploading state after all done
      setTimeout(() => {
        setUploadingAssets([]);
        loadAssets();
        if (successCount > 0) {
          toast.success(`✨ ${successCount} Bild(er) analysiert!`);
        }
        if (failCount > 0) {
          toast.warning(`⚠️ ${failCount} Analyse(n) fehlgeschlagen`);
        }
      }, 500);

    } catch (error: any) {
      toast.error("Upload fehlgeschlagen: " + error.message);
      setUploadingAssets([]);
    } finally {
      setUploading(false);
    }
  };

  const resetDialog = () => {
    setDialogOpen(false);
    setSelectedFiles([]);
    setSelectedTags([]);
    setMood("");
    setDescription("");
    setCustomTag("");
  };

  const handleDelete = async (asset: MediaAsset) => {
    setDeleting(asset.id);
    try {
      await supabase.storage.from("media-archive").remove([asset.storage_path]);
      const { error } = await supabase.from("media_assets").delete().eq("id", asset.id);
      if (error) throw error;
      toast.success("Bild gelöscht");
      loadAssets();
    } catch (error: any) {
      toast.error("Löschen fehlgeschlagen: " + error.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleReference = async (asset: MediaAsset) => {
    setTogglingReference(asset.id);
    try {
      const newValue = !asset.is_reference;
      const { error } = await supabase
        .from("media_assets")
        .update({ is_reference: newValue })
        .eq("id", asset.id);
      
      if (error) throw error;
      
      toast.success(newValue ? "Als AI-Referenz markiert" : "Referenz-Markierung entfernt");
      loadAssets();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setTogglingReference(null);
    }
  };

  const handleAnalyzeLibrary = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-media-vision", {
        body: { mode: "batch" }
      });

      if (error) {
        toast.error(`Analyse fehlgeschlagen: ${error.message}`);
        return;
      }

      if (!data?.success && data?.error) {
        toast.error(`Backend-Fehler: ${data.error}`);
        return;
      }

      if (data?.analyzed > 0) {
        toast.success(`✨ ${data.analyzed} Bilder analysiert!`);
        if (data?.errors > 0 && data?.errorDetails) {
          toast.error(`${data.errors} Fehler: ${data.errorDetails.slice(0, 2).join(", ")}`);
        }
        loadAssets();
      } else {
        toast.info(data?.message || "Alle Bilder sind bereits analysiert");
      }
    } catch (error: any) {
      toast.error(`Analyse-Exception: ${error.message || "Netzwerkfehler"}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Combine manual tags with AI tags for filtering
  const allTags = [...new Set([
    ...assets.flatMap(a => a.tags || []),
    ...assets.flatMap(a => a.ai_tags || [])
  ])];
  const filteredAssets = filterTag
    ? assets.filter(a => 
        a.tags?.includes(filterTag) || 
        a.ai_tags?.map(t => t.toLowerCase()).includes(filterTag.toLowerCase())
      )
    : assets;
  
  const unanalyzedCount = assets.filter(a => !a.analyzed).length;

  if (loading) {
    return (
      <AppLayout title="📸 Meine Bilder">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="📸 Meine Bilder"
      description="Deine Bilder für intelligente Post-Generierung"
      actions={
        <Button
          onClick={() => document.getElementById("media-upload")?.click()}
          className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/80 hover:to-cyan-500/80"
        >
          <Plus className="mr-2 h-4 w-4" />
          Bilder hinzufügen
        </Button>
      }
    >
      <input
        id="media-upload"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "border-2 border-dashed rounded-2xl transition-all duration-300 mb-6",
          isDragOver
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "border-border/50 hover:border-primary/50"
        )}
      >
        {assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center mb-6">
              <FolderOpen className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Dein Media-Archiv ist leer
            </h2>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Lade echte Fotos hoch und tagge sie. Die KI wählt automatisch passende Bilder für deine Posts.
            </p>
            <Button
              onClick={() => document.getElementById("media-upload")?.click()}
              size="lg"
              className="bg-gradient-to-r from-primary to-cyan-500"
            >
              <Upload className="mr-2 h-5 w-5" />
              Bilder hochladen
            </Button>
          </div>
        ) : (
          <div className="p-4 text-center text-muted-foreground">
            <Upload className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Bilder hier ablegen zum Hochladen</p>
          </div>
        )}
      </div>

      {assets.length > 0 && (
        <div className="space-y-6">
          {/* Stats, AI Analyze & Filter */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="glass-card px-4 py-3 rounded-xl">
              <p className="text-2xl font-bold text-foreground">{assets.length}</p>
              <p className="text-sm text-muted-foreground">Bilder</p>
            </div>
            <div className="glass-card px-4 py-3 rounded-xl">
              <p className="text-2xl font-bold text-foreground">
                {assets.filter(a => a.is_good_reference).length}
              </p>
              <p className="text-sm text-muted-foreground">AI-Referenzen</p>
            </div>
            <div className="glass-card px-4 py-3 rounded-xl">
              <p className="text-2xl font-bold text-foreground">
                {assets.filter(a => a.analyzed).length}
              </p>
              <p className="text-sm text-muted-foreground">Analysiert</p>
            </div>

            {/* AI Analyze Button */}
            {unanalyzedCount > 0 && (
              <Button
                onClick={handleAnalyzeLibrary}
                disabled={analyzing}
                variant="outline"
                className="border-primary/30 hover:bg-primary/10"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analysiere...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4 text-primary" />
                    ✨ KI-Analyse starten ({unanalyzedCount})
                  </>
                )}
              </Button>
            )}

            <div className="flex-1" />

            {/* Tag Filter */}
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={filterTag === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilterTag(null)}
              >
                Alle
              </Badge>
              {allTags.slice(0, 8).map(tag => (
                <Badge
                  key={tag}
                  variant={filterTag === tag ? "default" : "outline"}
                  className="cursor-pointer capitalize"
                  onClick={() => setFilterTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredAssets.map((asset) => (
              <Card
                key={asset.id}
                className={cn(
                  "glass-card overflow-hidden group relative",
                  asset.used_count === 0 && "ring-2 ring-primary/30"
                )}
              >
                <CardContent className="p-0">
                  <div className="aspect-square relative">
                    {asset.public_url ? (
                      <img
                        src={asset.public_url}
                        alt={asset.filename || "Media"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}

                    {/* Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setViewingAsset(asset)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(asset)}
                        disabled={deleting === asset.id}
                      >
                        {deleting === asset.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {/* Status Badges */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {/* Analyzing indicator */}
                      {uploadingAssets.find(u => u.id === asset.id)?.analyzing && (
                        <div className="px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-xs flex items-center gap-1 animate-pulse">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          KI analysiert...
                        </div>
                      )}
                      {asset.is_good_reference && (
                        <div className="px-2 py-0.5 rounded-full bg-green-500/90 text-white text-xs flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          REF
                        </div>
                      )}
                      {asset.analyzed && !uploadingAssets.find(u => u.id === asset.id)?.analyzing && (
                        <div className="px-2 py-0.5 rounded-full bg-primary/80 text-white text-xs flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          AI
                        </div>
                      )}
                    </div>
                    
                    {asset.used_count > 0 && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs">
                        {asset.used_count}×
                      </div>
                    )}
                  </div>

                  <div className="p-3 space-y-2">
                    {/* AI Analysis Info */}
                    {asset.analyzed ? (
                      <div className="space-y-1">
                        {asset.ai_description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {asset.ai_description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {asset.ai_tags?.slice(0, 3).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs capitalize">
                              {tag}
                            </Badge>
                          ))}
                          {(asset.ai_tags?.length || 0) > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{(asset.ai_tags?.length || 0) - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {asset.tags?.slice(0, 3).map(tag => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {!asset.tags?.length && (
                          <span className="text-xs text-muted-foreground italic">Nicht analysiert</span>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(asset.created_at), "dd. MMM", { locale: de })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={dialogOpen} onOpenChange={resetDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bilder taggen & hochladen</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Preview */}
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
                  <span className="text-sm text-muted-foreground">+{selectedFiles.length - 8}</span>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Tags (für intelligente Auswahl)
              </Label>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TAGS.map(tag => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer transition-all"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <Input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  placeholder="Eigener Tag..."
                  className="glass-input flex-1"
                  onKeyDown={(e) => e.key === "Enter" && addCustomTag()}
                />
                <Button variant="outline" size="sm" onClick={addCustomTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedTags.map(tag => (
                    <Badge key={tag} className="gap-1">
                      {tag}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => toggleTag(tag)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Mood */}
            <div className="space-y-2">
              <Label>Stimmung / Mood</Label>
              <div className="flex flex-wrap gap-2">
                {MOODS.map(m => (
                  <Badge
                    key={m}
                    variant={mood === m ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setMood(mood === m ? "" : m)}
                  >
                    {m}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Beschreibung (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="z.B. Aufnahme am Set für Film XY..."
                className="glass-input"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button variant="outline" onClick={resetDialog} className="flex-1">
                Abbrechen
              </Button>
              <Button onClick={handleUpload} disabled={uploading} className="flex-1">
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {selectedFiles.length} Bild{selectedFiles.length > 1 ? "er" : ""} hochladen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Asset Detail Dialog */}
      <Dialog open={!!viewingAsset} onOpenChange={() => setViewingAsset(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingAsset?.is_good_reference && (
                <Badge className="bg-green-500">Referenz-Bild</Badge>
              )}
              {viewingAsset?.analyzed && (
                <Badge variant="secondary">KI-analysiert</Badge>
              )}
              {!viewingAsset?.analyzed && (
                <Badge variant="outline">Nicht analysiert</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {viewingAsset && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="aspect-square rounded-xl overflow-hidden bg-muted">
                <img
                  src={viewingAsset.public_url || ""}
                  alt={viewingAsset.filename || "Bild"}
                  className="w-full h-full object-cover"
                />
              </div>
              
              <div className="space-y-4">
                {viewingAsset.mood && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Stimmung (Mood)</Label>
                    <Badge className="mt-1 bg-primary/20 text-primary">{viewingAsset.mood}</Badge>
                  </div>
                )}

                {viewingAsset.ai_description && (
                  <div>
                    <Label className="text-muted-foreground text-xs">KI-Beschreibung</Label>
                    <p className="text-sm mt-1">{viewingAsset.ai_description}</p>
                  </div>
                )}
                
                {viewingAsset.ai_tags && viewingAsset.ai_tags.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground text-xs">KI-Tags</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {viewingAsset.ai_tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="capitalize">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {viewingAsset.tags && viewingAsset.tags.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground text-xs">Manuelle Tags</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {viewingAsset.tags.map(tag => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground text-xs">Für Montagen geeignet</Label>
                    <p className="flex items-center gap-1 mt-1">
                      {viewingAsset.is_good_reference ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          Ja
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 text-muted-foreground" />
                          Nein
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Verwendet</Label>
                    <p className="mt-1">{viewingAsset.used_count}×</p>
                  </div>
                </div>
                
                <div>
                  <Label className="text-muted-foreground text-xs">Hochgeladen</Label>
                  <p className="text-sm mt-1">
                    {format(new Date(viewingAsset.created_at), "dd. MMMM yyyy, HH:mm", { locale: de })}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
