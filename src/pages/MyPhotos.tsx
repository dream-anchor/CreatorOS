import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Upload,
  Plus,
  Trash2,
  Image as ImageIcon,
  Sparkles,
  User,
  Tag,
  X,
  Loader2,
  Camera,
} from "lucide-react";
import { toast } from "sonner";

interface MediaAsset {
  id: string;
  storage_path: string;
  public_url: string | null;
  filename: string | null;
  description: string | null;
  tags: string[] | null;
  mood: string | null;
  is_selfie: boolean;
  ai_usable: boolean;
  used_count: number;
  created_at: string;
}

export default function MyPhotos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    description: "",
    tags: "",
    mood: "",
    is_selfie: true,
    ai_usable: true,
  });

  // Fetch user's media assets
  const { data: photos, isLoading } = useQuery({
    queryKey: ["my-photos", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("media_assets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as MediaAsset[];
    },
    enabled: !!user,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("media-archive")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("media-archive")
        .getPublicUrl(fileName);

      // Parse tags
      const tagsArray = formData.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // Insert into database
      const { error: dbError } = await supabase.from("media_assets").insert({
        user_id: user.id,
        storage_path: fileName,
        public_url: urlData.publicUrl,
        filename: file.name,
        description: formData.description || null,
        tags: tagsArray.length > 0 ? tagsArray : null,
        mood: formData.mood || null,
        is_selfie: formData.is_selfie,
        ai_usable: formData.ai_usable,
      });

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-photos"] });
      toast.success("Foto erfolgreich hochgeladen!");
      resetForm();
      setUploadDialogOpen(false);
    },
    onError: (error) => {
      toast.error(`Upload fehlgeschlagen: ${error.message}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (photo: MediaAsset) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("media-archive")
        .remove([photo.storage_path]);

      if (storageError) console.warn("Storage delete error:", storageError);

      // Delete from database
      const { error: dbError } = await supabase
        .from("media_assets")
        .delete()
        .eq("id", photo.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-photos"] });
      toast.success("Foto gelöscht");
    },
    onError: (error) => {
      toast.error(`Löschen fehlgeschlagen: ${error.message}`);
    },
  });

  // Toggle AI usable
  const toggleAiUsable = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase
        .from("media_assets")
        .update({ ai_usable: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-photos"] });
    },
  });

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFormData({
      description: "",
      tags: "",
      mood: "",
      is_selfie: true,
      ai_usable: true,
    });
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }, []);

  const handleUpload = () => {
    if (selectedFile) {
      setIsUploading(true);
      uploadMutation.mutate(selectedFile, {
        onSettled: () => setIsUploading(false),
      });
    }
  };

  const selfiePhotos = photos?.filter((p) => p.is_selfie) || [];
  const otherPhotos = photos?.filter((p) => !p.is_selfie) || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Meine Fotos</h1>
          <p className="text-muted-foreground mt-1">
            Dein Foto-Kleiderschrank für die KI – diese Bilder kann der Agent für Content nutzen
          </p>
        </div>

        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Foto hochladen
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Neues Referenzfoto
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-4">
              {/* File Drop Zone */}
              {!previewUrl ? (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">
                    Klicke oder ziehe ein Bild hierher
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </label>
              ) : (
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded-xl"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8"
                    onClick={resetForm}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Form Fields */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="description">Beschreibung</Label>
                  <Textarea
                    id="description"
                    placeholder="z.B. 'Antoine lachend im Anzug am Set'"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={2}
                  />
                </div>

                <div>
                  <Label htmlFor="tags">Tags (kommagetrennt)</Label>
                  <Input
                    id="tags"
                    placeholder="Business, Lustig, Anzug"
                    value={formData.tags}
                    onChange={(e) =>
                      setFormData({ ...formData, tags: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="mood">Stimmung</Label>
                  <Input
                    id="mood"
                    placeholder="z.B. Fröhlich, Nachdenklich, Sarkastisch"
                    value={formData.mood}
                    onChange={(e) =>
                      setFormData({ ...formData, mood: e.target.value })
                    }
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="is_selfie">Bin ich auf dem Bild?</Label>
                  </div>
                  <Switch
                    id="is_selfie"
                    checked={formData.is_selfie}
                    onCheckedChange={(v) =>
                      setFormData({ ...formData, is_selfie: v })
                    }
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="ai_usable">KI darf dieses Bild nutzen</Label>
                  </div>
                  <Switch
                    id="ai_usable"
                    checked={formData.ai_usable}
                    onCheckedChange={(v) =>
                      setFormData({ ...formData, ai_usable: v })
                    }
                  />
                </div>
              </div>

              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="w-full gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Wird hochgeladen...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Hochladen
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-foreground">{photos?.length || 0}</div>
            <div className="text-sm text-muted-foreground">Gesamt</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">{selfiePhotos.length}</div>
            <div className="text-sm text-muted-foreground">Mit dir</div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-accent">
              {photos?.filter((p) => p.ai_usable).length || 0}
            </div>
            <div className="text-sm text-muted-foreground">KI-freigegeben</div>
          </CardContent>
        </Card>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && photos?.length === 0 && (
        <div className="text-center py-16 bg-muted/30 rounded-2xl">
          <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Noch keine Fotos
          </h3>
          <p className="text-muted-foreground mb-4">
            Lade Referenzfotos hoch, die der KI-Agent für Content nutzen kann
          </p>
          <Button onClick={() => setUploadDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Erstes Foto hochladen
          </Button>
        </div>
      )}

      {/* Selfie Photos Section */}
      {selfiePhotos.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <User className="h-5 w-5" />
            Fotos von mir ({selfiePhotos.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {selfiePhotos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onDelete={() => deleteMutation.mutate(photo)}
                onToggleAi={(value) =>
                  toggleAiUsable.mutate({ id: photo.id, value })
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Other Photos Section */}
      {otherPhotos.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Weitere Medien ({otherPhotos.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {otherPhotos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onDelete={() => deleteMutation.mutate(photo)}
                onToggleAi={(value) =>
                  toggleAiUsable.mutate({ id: photo.id, value })
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Photo Card Component
function PhotoCard({
  photo,
  onDelete,
  onToggleAi,
}: {
  photo: MediaAsset;
  onDelete: () => void;
  onToggleAi: (value: boolean) => void;
}) {
  return (
    <Card className="glass-card overflow-hidden group">
      <div className="aspect-square relative">
        <img
          src={photo.public_url || ""}
          alt={photo.description || "Photo"}
          className="w-full h-full object-cover"
        />

        {/* Overlay with controls */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Badges */}
        <div className="absolute top-2 left-2 flex gap-1">
          {photo.is_selfie && (
            <Badge className="bg-primary/90 text-primary-foreground text-xs">
              <User className="h-3 w-3 mr-1" />
              Ich
            </Badge>
          )}
        </div>

        {/* AI Toggle */}
        <div className="absolute top-2 right-2">
          <button
            onClick={() => onToggleAi(!photo.ai_usable)}
            className={`p-1.5 rounded-full transition-colors ${
              photo.ai_usable
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground"
            }`}
            title={photo.ai_usable ? "KI-Nutzung erlaubt" : "KI-Nutzung gesperrt"}
          >
            <Sparkles className="h-4 w-4" />
          </button>
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        {photo.description && (
          <p className="text-sm text-foreground line-clamp-2">{photo.description}</p>
        )}

        {photo.tags && photo.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {photo.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                <Tag className="h-2.5 w-2.5 mr-1" />
                {tag}
              </Badge>
            ))}
            {photo.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{photo.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {photo.mood && (
          <p className="text-xs text-muted-foreground">
            Stimmung: {photo.mood}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
