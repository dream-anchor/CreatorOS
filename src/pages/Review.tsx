import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Post, Asset } from "@/types/database";
import { toast } from "sonner";
import {
  Loader2,
  Check,
  X,
  Upload,
  Image as ImageIcon,
  Eye,
  Sparkles,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export default function ReviewPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<(Post & { assets?: Asset[] })[]>([]);
  const [selectedPost, setSelectedPost] = useState<(Post & { assets?: Asset[] }) | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedCaption, setEditedCaption] = useState("");
  const [editedHashtags, setEditedHashtags] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (user) loadPosts();
  }, [user]);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*, assets(*)")
        .eq("status", "READY_FOR_REVIEW")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts((data as (Post & { assets?: Asset[] })[]) || []);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openPost = (post: Post & { assets?: Asset[] }) => {
    setSelectedPost(post);
    setEditedCaption(post.caption || "");
    setEditedHashtags(post.hashtags || "");
    setShowRejectInput(false);
    setRejectReason("");
    setDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedPost) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from("posts")
        .update({
          status: "APPROVED",
          caption: editedCaption,
          hashtags: editedHashtags,
          approved_at: new Date().toISOString(),
          approved_by: user!.id,
        })
        .eq("id", selectedPost.id);

      if (error) throw error;

      // Log the approval
      await supabase.from("logs").insert({
        user_id: user!.id,
        post_id: selectedPost.id,
        event_type: "post_approved",
        level: "info",
        details: { caption_length: editedCaption.length },
      });

      toast.success("Post genehmigt!");
      setDialogOpen(false);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPost) return;
    if (!rejectReason.trim()) {
      toast.error("Bitte gib einen Grund an");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("posts")
        .update({
          status: "REJECTED",
          error_message: rejectReason,
        })
        .eq("id", selectedPost.id);

      if (error) throw error;

      await supabase.from("logs").insert({
        user_id: user!.id,
        post_id: selectedPost.id,
        event_type: "post_rejected",
        level: "warn",
        details: { reason: rejectReason },
      });

      toast.success("Post abgelehnt");
      setDialogOpen(false);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPost) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user!.id}/${selectedPost.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("post-assets")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("post-assets")
        .getPublicUrl(fileName);

      const { error: assetError } = await supabase.from("assets").insert({
        user_id: user!.id,
        post_id: selectedPost.id,
        storage_path: fileName,
        public_url: urlData.publicUrl,
        source: "upload",
      });

      if (assetError) throw assetError;

      toast.success("Bild hochgeladen!");
      
      // Refresh post data
      const { data: updatedPost } = await supabase
        .from("posts")
        .select("*, assets(*)")
        .eq("id", selectedPost.id)
        .single();
      
      if (updatedPost) {
        setSelectedPost(updatedPost as Post & { assets?: Asset[] });
      }
    } catch (error: any) {
      toast.error("Upload fehlgeschlagen: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!selectedPost) return;
    
    // Get the asset prompt from the post metadata or use caption as fallback
    const prompt = selectedPost.caption?.slice(0, 200) || "Professional Instagram post image";
    
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-asset", {
        body: { 
          postId: selectedPost.id, 
          prompt: prompt 
        },
      });

      if (error) throw error;

      toast.success("Bild generiert!");
      
      // Refresh post data
      const { data: updatedPost } = await supabase
        .from("posts")
        .select("*, assets(*)")
        .eq("id", selectedPost.id)
        .single();
      
      if (updatedPost) {
        setSelectedPost(updatedPost as Post & { assets?: Asset[] });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unbekannter Fehler";
      toast.error("Generierung fehlgeschlagen: " + msg);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <AppLayout title="Review">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Review"
      description="Prüfe und genehmige Entwürfe vor der Veröffentlichung"
    >
      {posts.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Eye className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Keine Posts zur Prüfung</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Card
              key={post.id}
              className="glass-card cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => openPost(post)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <StatusBadge status={post.status} />
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(post.created_at), "dd. MMM", { locale: de })}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {post.assets && post.assets.length > 0 ? (
                  <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                    <img
                      src={post.assets[0].public_url || ""}
                      alt="Post preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                )}
                <p className="text-sm line-clamp-3">{post.caption}</p>
                <p className="text-xs text-primary line-clamp-1">{post.hashtags}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post Review</DialogTitle>
          </DialogHeader>

          {selectedPost && (
            <div className="grid gap-6 md:grid-cols-2">
              {/* Preview */}
              <div className="space-y-4">
                <Label>Bild</Label>
                {selectedPost.assets && selectedPost.assets.length > 0 ? (
                  <div className="space-y-2">
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img
                        src={selectedPost.assets[0].public_url || ""}
                        alt="Post preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={uploading}
                        onClick={() => document.getElementById("file-upload")?.click()}
                      >
                        {uploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Ersetzen
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={generating}
                        onClick={handleGenerateImage}
                      >
                        {generating ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Neu generieren
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-square rounded-lg bg-muted flex flex-col items-center justify-center gap-3">
                    <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploading}
                        onClick={() => document.getElementById("file-upload")?.click()}
                      >
                        {uploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Hochladen
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={generating}
                        onClick={handleGenerateImage}
                      >
                        {generating ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Generieren
                      </Button>
                    </div>
                  </div>
                )}
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {selectedPost.alt_text && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Alt-Text</Label>
                    <p className="text-sm mt-1">{selectedPost.alt_text}</p>
                  </div>
                )}
              </div>

              {/* Edit */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="caption">Caption</Label>
                  <Textarea
                    id="caption"
                    value={editedCaption}
                    onChange={(e) => setEditedCaption(e.target.value)}
                    className="min-h-[200px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    {editedCaption.length} Zeichen
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="hashtags">Hashtags</Label>
                  <Textarea
                    id="hashtags"
                    value={editedHashtags}
                    onChange={(e) => setEditedHashtags(e.target.value)}
                    className="min-h-[80px] text-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    {editedHashtags.split("#").filter(Boolean).length} Hashtags
                  </p>
                </div>

                {showRejectInput && (
                  <div className="space-y-2">
                    <Label htmlFor="reject-reason">Ablehnungsgrund</Label>
                    <Input
                      id="reject-reason"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Warum wird dieser Post abgelehnt?"
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  {showRejectInput ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setShowRejectInput(false)}
                        className="flex-1"
                      >
                        Abbrechen
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleReject}
                        disabled={saving}
                        className="flex-1"
                      >
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Ablehnen
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setShowRejectInput(true)}
                        className="flex-1"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Ablehnen
                      </Button>
                      <Button onClick={handleApprove} disabled={saving} className="flex-1">
                        {saving ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        Genehmigen
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
