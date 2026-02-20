import { useEffect, useState, useCallback, useMemo } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiPost, apiDelete, invokeFunction, getPresignedUrl, uploadToR2, deleteFromR2 } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Image as ImageIcon,
  Trash2,
  FolderOpen,
  X,
  Sparkles,
  Wand2,
  CheckCircle,
  Eye,
  Zap,
  Camera,
  Bot,
} from "lucide-react";
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

export default function MediaArchivePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [viewingAsset, setViewingAsset] = useState<MediaAsset | null>(null);
  const [uploadingAssets, setUploadingAssets] = useState<UploadingAsset[]>([]);
  const [analyzingSingleId, setAnalyzingSingleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"my-photos" | "ai-generated">("my-photos");

  useEffect(() => {
    if (user) loadAssets();
  }, [user]);

  const loadAssets = async () => {
    try {
      const data = await apiGet<MediaAsset[]>("/api/media", { order: "created_at:desc" });
      setAssets(data || []);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Split assets by source
  const { myPhotos, aiGenerated } = useMemo(() => {
    const my: MediaAsset[] = [];
    const ai: MediaAsset[] = [];
    
    assets.forEach(asset => {
      // Check source field from DB - if 'generate' it's AI, otherwise it's user upload
      const assetWithSource = asset as MediaAsset & { source?: string };
      if (assetWithSource.source === 'generate') {
        ai.push(asset);
      } else {
        my.push(asset);
      }
    });
    
    return { myPhotos: my, aiGenerated: ai };
  }, [assets]);

  const currentAssets = activeTab === "my-photos" ? myPhotos : aiGenerated;

  // Combine manual tags with AI tags for filtering
  const allTags = [...new Set([
    ...currentAssets.flatMap(a => a.tags || []),
    ...currentAssets.flatMap(a => a.ai_tags || [])
  ])];

  const filteredAssets = filterTag
    ? currentAssets.filter(a => 
        a.tags?.includes(filterTag) || 
        a.ai_tags?.map(t => t.toLowerCase()).includes(filterTag.toLowerCase())
      )
    : currentAssets;
  
  const unanalyzedCount = currentAssets.filter(a => !a.analyzed).length;

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

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    resetDialog();

    const uploadedAssets: UploadingAsset[] = [];

    try {
      for (const file of selectedFiles) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${user!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { urls } = await getPresignedUrl([{ fileName, contentType: file.type, folder: "media-archive" }]);
        await uploadToR2(urls[0].uploadUrl, file, file.type);

        const insertData = await apiPost<{ id: string }>("/api/media", {
          user_id: user!.id,
          storage_path: urls[0].key,
          public_url: urls[0].publicUrl,
          filename: file.name,
          tags: [],
          analyzed: false,
        });

        uploadedAssets.push({
          id: insertData.id,
          filename: file.name,
          public_url: urls[0].publicUrl,
          analyzing: true,
        });
      }

      setUploadingAssets(uploadedAssets);
      toast.success(`${uploadedAssets.length} Bild(er) hochgeladen! ✨ KI analysiert...`);
      loadAssets();

      // Auto-analyze each uploaded asset
      let successCount = 0;
      let failCount = 0;
      
      for (const asset of uploadedAssets) {
        try {
          const { data, error } = await invokeFunction("analyze-media-vision", {
            body: {
              mode: "auto",
              asset_id: asset.id,
              image_url: asset.public_url
            }
          });

          if (error) {
            console.error(`Analysis error for ${asset.id}:`, error);
            failCount++;
          } else if (data && !(data as any).success) {
            console.error(`Analysis failed for ${asset.id}:`, (data as any).error);
            failCount++;
          } else {
            successCount++;
          }

          setUploadingAssets(prev => 
            prev.map(a => a.id === asset.id ? { ...a, analyzing: false } : a)
          );
        } catch (error: any) {
          console.error(`Auto-analysis exception for ${asset.id}:`, error);
          failCount++;
        }
      }

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
  };

  const handleDelete = async (asset: MediaAsset) => {
    setDeleting(asset.id);
    try {
      await deleteFromR2(asset.storage_path);
      await apiDelete(`/api/media/${asset.id}`);
      toast.success("Bild gelöscht");
      loadAssets();
    } catch (error: any) {
      toast.error("Löschen fehlgeschlagen: " + error.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleAnalyzeLibrary = async () => {
    setAnalyzing(true);
    try {
      const { data, error } = await invokeFunction<any>("analyze-media-vision", {
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
        toast.success(`${data.analyzed} Bilder analysiert!`);
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

  const handleAnalyzeSingle = async (asset: MediaAsset) => {
    if (!asset.public_url) {
      toast.error("Kein Bild-URL vorhanden");
      return;
    }
    
    setAnalyzingSingleId(asset.id);
    toast.info("⚡️ Analyse gestartet...");
    
    try {
      const { data, error } = await invokeFunction<any>("analyze-media-vision", {
        body: {
          mode: "auto",
          asset_id: asset.id,
          image_url: asset.public_url
        }
      });

      if (error) {
        if (error.message?.includes("429") || error.message?.toLowerCase().includes("rate")) {
          toast.error("Zu schnell! Bitte kurz warten und erneut versuchen.");
        } else {
          toast.error(`Analyse-Fehler: ${error.message || "Unbekannt"}`);
        }
        return;
      }

      if (data && !data.success) {
        if (data.error?.includes("429") || data.error?.toLowerCase().includes("rate")) {
          toast.error("Zu schnell! Bitte kurz warten und erneut versuchen.");
        } else {
          toast.error(`Analyse fehlgeschlagen: ${data.error || "Unbekannter Fehler"}`);
        }
        return;
      }

      toast.success("Bild erfolgreich analysiert!");
      loadAssets();
    } catch (error: any) {
      if (error.message?.includes("429") || error.message?.toLowerCase().includes("rate")) {
        toast.error("⏳ Zu schnell! Bitte kurz warten und erneut versuchen.");
      } else {
        toast.error(`Analyse-Exception: ${error.message || "Netzwerkfehler"}`);
      }
    } finally {
      setAnalyzingSingleId(null);
    }
  };

  if (loading) {
    return (
      <GlobalLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </GlobalLayout>
    );
  }

  return (
    <GlobalLayout>
      <div className="p-4 sm:p-6 lg:p-8">
        <input
          id="media-upload"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Header with Tabs */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-4">Medien</h1>
          
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "my-photos" | "ai-generated"); setFilterTag(null); }}>
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="my-photos" className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Meine Bilder
                <Badge variant="secondary" className="ml-1 text-xs">{myPhotos.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="ai-generated" className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                KI-Generiert
                <Badge variant="secondary" className="ml-1 text-xs">{aiGenerated.length}</Badge>
              </TabsTrigger>
            </TabsList>

            {/* My Photos Tab */}
            <TabsContent value="my-photos" className="mt-6">
              {/* Drop Zone for uploads */}
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
                {myPhotos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center mb-6">
                      <FolderOpen className="h-10 w-10 text-primary" />
                    </div>
                    <h2 className="text-xl font-semibold text-foreground mb-2">
                      Dein Foto-Archiv ist leer
                    </h2>
                    <p className="text-muted-foreground text-center max-w-md mb-6">
                      Lade echte Fotos von dir hoch. Die KI nutzt sie als Referenz für personalisierte Bildgenerierungen.
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

              {myPhotos.length > 0 && (
                <AssetGrid
                  assets={filteredAssets}
                  allTags={allTags}
                  filterTag={filterTag}
                  setFilterTag={setFilterTag}
                  unanalyzedCount={unanalyzedCount}
                  analyzing={analyzing}
                  handleAnalyzeLibrary={handleAnalyzeLibrary}
                  handleAnalyzeSingle={handleAnalyzeSingle}
                  handleDelete={handleDelete}
                  setViewingAsset={setViewingAsset}
                  deleting={deleting}
                  uploadingAssets={uploadingAssets}
                  analyzingSingleId={analyzingSingleId}
                  showUploadButton
                  stats={{ total: myPhotos.length, references: myPhotos.filter(a => a.is_good_reference).length, analyzed: myPhotos.filter(a => a.analyzed).length }}
                />
              )}
            </TabsContent>

            {/* AI Generated Tab */}
            <TabsContent value="ai-generated" className="mt-6">
              {aiGenerated.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-border/50 rounded-2xl">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-6">
                    <Bot className="h-10 w-10 text-purple-500" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-2">
                    Noch keine KI-Bilder
                  </h2>
                  <p className="text-muted-foreground text-center max-w-md">
                    Bilder, die du über den Chat generieren lässt, erscheinen hier automatisch.
                  </p>
                </div>
              ) : (
                <AssetGrid
                  assets={filteredAssets}
                  allTags={allTags}
                  filterTag={filterTag}
                  setFilterTag={setFilterTag}
                  unanalyzedCount={0}
                  analyzing={false}
                  handleAnalyzeLibrary={() => {}}
                  handleAnalyzeSingle={handleAnalyzeSingle}
                  handleDelete={handleDelete}
                  setViewingAsset={setViewingAsset}
                  deleting={deleting}
                  uploadingAssets={[]}
                  analyzingSingleId={analyzingSingleId}
                  showUploadButton={false}
                  stats={{ total: aiGenerated.length, references: 0, analyzed: aiGenerated.filter(a => a.analyzed).length }}
                  isAiTab
                />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Upload Dialog */}
        <Dialog open={dialogOpen} onOpenChange={resetDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Bilder hochladen</DialogTitle>
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
                    <span className="text-sm text-muted-foreground">
                      +{selectedFiles.length - 8}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                Die KI analysiert deine Bilder automatisch nach dem Upload und erkennt Stimmung, Tags und ob sie sich als Referenz eignen.
              </p>

              <Button
                onClick={handleUpload}
                disabled={uploading || selectedFiles.length === 0}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Lädt hoch...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {selectedFiles.length} Bild(er) hochladen
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Asset Dialog */}
        <Dialog open={!!viewingAsset} onOpenChange={() => setViewingAsset(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{viewingAsset?.filename || "Bild-Details"}</DialogTitle>
            </DialogHeader>
            
            {viewingAsset && (
              <div className="space-y-4">
                <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                  <img
                    src={viewingAsset.public_url || ""}
                    alt={viewingAsset.filename || ""}
                    className="w-full h-full object-contain"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Hochgeladen</p>
                    <p className="font-medium">
                      {format(new Date(viewingAsset.created_at), "dd. MMMM yyyy, HH:mm", { locale: de })}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Verwendet</p>
                    <p className="font-medium">{viewingAsset.used_count}×</p>
                  </div>
                </div>

                {viewingAsset.ai_description && (
                  <div>
                    <p className="text-muted-foreground text-sm mb-1">KI-Beschreibung</p>
                    <p className="text-foreground">{viewingAsset.ai_description}</p>
                  </div>
                )}

                {viewingAsset.ai_tags && viewingAsset.ai_tags.length > 0 && (
                  <div>
                    <p className="text-muted-foreground text-sm mb-2">KI-Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {viewingAsset.ai_tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="capitalize">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {viewingAsset.is_good_reference && (
                    <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Gute Referenz
                    </Badge>
                  )}
                  {viewingAsset.analyzed && (
                    <Badge className="bg-primary/20 text-primary border-primary/30">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Analysiert
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </GlobalLayout>
  );
}

// Extracted Asset Grid Component
interface AssetGridProps {
  assets: MediaAsset[];
  allTags: string[];
  filterTag: string | null;
  setFilterTag: (tag: string | null) => void;
  unanalyzedCount: number;
  analyzing: boolean;
  handleAnalyzeLibrary: () => void;
  handleAnalyzeSingle: (asset: MediaAsset) => void;
  handleDelete: (asset: MediaAsset) => void;
  setViewingAsset: (asset: MediaAsset | null) => void;
  deleting: string | null;
  uploadingAssets: UploadingAsset[];
  analyzingSingleId: string | null;
  showUploadButton?: boolean;
  stats: { total: number; references: number; analyzed: number };
  isAiTab?: boolean;
}

function AssetGrid({
  assets,
  allTags,
  filterTag,
  setFilterTag,
  unanalyzedCount,
  analyzing,
  handleAnalyzeLibrary,
  handleAnalyzeSingle,
  handleDelete,
  setViewingAsset,
  deleting,
  uploadingAssets,
  analyzingSingleId,
  showUploadButton = true,
  stats,
  isAiTab = false,
}: AssetGridProps) {
  return (
    <div className="space-y-6">
      {/* Stats & Filter Row */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        <div className="glass-card px-4 py-3 rounded-xl">
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-sm text-muted-foreground">Bilder</p>
        </div>
        {!isAiTab && (
          <div className="glass-card px-4 py-3 rounded-xl">
            <p className="text-2xl font-bold text-foreground">{stats.references}</p>
            <p className="text-sm text-muted-foreground">Referenzen</p>
          </div>
        )}
        <div className="glass-card px-4 py-3 rounded-xl">
          <p className="text-2xl font-bold text-foreground">{stats.analyzed}</p>
          <p className="text-sm text-muted-foreground">Analysiert</p>
        </div>

        {/* AI Analyze Button */}
        {unanalyzedCount > 0 && !isAiTab && (
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

        {/* Upload Button */}
        {showUploadButton && (
          <Button
            onClick={() => document.getElementById("media-upload")?.click()}
            variant="outline"
          >
            <Upload className="mr-2 h-4 w-4" />
            Hochladen
          </Button>
        )}
      </div>

      {/* Tag Filter */}
      {allTags.length > 0 && (
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
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {assets.map((asset) => (
          <Card
            key={asset.id}
            className={cn(
              "glass-card overflow-hidden group relative",
              asset.used_count === 0 && !isAiTab && "ring-2 ring-primary/30"
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
                  {uploadingAssets.find(u => u.id === asset.id)?.analyzing && (
                    <div className="px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-xs flex items-center gap-1 animate-pulse">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      KI analysiert...
                    </div>
                  )}
                  {asset.is_good_reference && !isAiTab && (
                    <div className="px-2 py-0.5 rounded-full bg-green-500/90 text-white text-xs flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      REF
                    </div>
                  )}
                  {isAiTab && (
                    <div className="px-2 py-0.5 rounded-full bg-purple-500/90 text-white text-xs flex items-center gap-1">
                      <Bot className="h-3 w-3" />
                      KI
                    </div>
                  )}
                  {asset.analyzed && !uploadingAssets.find(u => u.id === asset.id)?.analyzing && !isAiTab && (
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
                  <div className="space-y-2">
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
                    {!isAiTab && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAnalyzeSingle(asset)}
                        disabled={analyzingSingleId === asset.id}
                        className="w-full border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                      >
                        {analyzingSingleId === asset.id ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Analysiere...
                          </>
                        ) : (
                          <>
                            <Zap className="mr-1 h-3 w-3" />
                            Jetzt analysieren
                          </>
                        )}
                      </Button>
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
  );
}