import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Sparkles,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function ReviewPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<(Post & { assets?: Asset[] })[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedCaption, setEditedCaption] = useState("");
  const [editedHashtags, setEditedHashtags] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);

  useEffect(() => {
    if (user) loadPosts();
  }, [user]);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*, assets(*)")
        .eq("status", "READY_FOR_REVIEW")
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      setPosts((data as (Post & { assets?: Asset[] })[]) || []);
      setCurrentIndex(0);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const currentPost = posts[currentIndex];

  const handleApprove = async () => {
    if (!currentPost) return;
    setSaving(true);
    setSwipeDirection("right");

    try {
      const { error } = await supabase
        .from("posts")
        .update({
          status: "APPROVED",
          caption: editedCaption || currentPost.caption,
          hashtags: editedHashtags || currentPost.hashtags,
          approved_at: new Date().toISOString(),
          approved_by: user!.id,
        })
        .eq("id", currentPost.id);

      if (error) throw error;

      await supabase.from("logs").insert({
        user_id: user!.id,
        post_id: currentPost.id,
        event_type: "post_approved",
        level: "info",
      });

      toast.success("Post eingeplant! ✨");
      
      setTimeout(() => {
        const newPosts = posts.filter((_, i) => i !== currentIndex);
        setPosts(newPosts);
        setCurrentIndex(Math.min(currentIndex, newPosts.length - 1));
        setSwipeDirection(null);
        setDialogOpen(false);
      }, 300);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
      setSwipeDirection(null);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!currentPost) return;
    setSaving(true);
    setSwipeDirection("left");

    try {
      const { error } = await supabase
        .from("posts")
        .update({
          status: "REJECTED",
          error_message: rejectReason || "Vom Nutzer abgelehnt",
        })
        .eq("id", currentPost.id);

      if (error) throw error;

      await supabase.from("logs").insert({
        user_id: user!.id,
        post_id: currentPost.id,
        event_type: "post_rejected",
        level: "warn",
        details: { reason: rejectReason },
      });

      toast.success("Post verworfen");
      
      setTimeout(() => {
        const newPosts = posts.filter((_, i) => i !== currentIndex);
        setPosts(newPosts);
        setCurrentIndex(Math.min(currentIndex, newPosts.length - 1));
        setSwipeDirection(null);
        setShowRejectInput(false);
        setRejectReason("");
      }, 300);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
      setSwipeDirection(null);
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = () => {
    if (!currentPost) return;
    setEditedCaption(currentPost.caption || "");
    setEditedHashtags(currentPost.hashtags || "");
    setShowRejectInput(false);
    setRejectReason("");
    setDialogOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentPost) return;

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user!.id}/${currentPost.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("post-assets")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("post-assets")
        .getPublicUrl(fileName);

      await supabase.from("assets").insert({
        user_id: user!.id,
        post_id: currentPost.id,
        storage_path: fileName,
        public_url: urlData.publicUrl,
        source: "upload",
      });

      toast.success("Bild hochgeladen!");
      loadPosts();
    } catch (error: any) {
      toast.error("Upload fehlgeschlagen: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!currentPost) return;
    
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-asset", {
        body: { 
          postId: currentPost.id, 
          prompt: currentPost.caption?.slice(0, 200) || "Professional Instagram post" 
        },
      });

      if (error) throw error;
      toast.success("Bild generiert!");
      loadPosts();
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
    <AppLayout title="Tinder Review" description="Swipe durch deine Entwürfe">
      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center mb-6">
            <Check className="h-12 w-12 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Alles erledigt! 🎉</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Keine Entwürfe zur Prüfung. Nutze den Auto-Fill im Cockpit, um neue Entwürfe zu generieren.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-6">
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} von {posts.length}
            </span>
            <div className="flex gap-1">
              {posts.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    i === currentIndex ? "bg-primary w-6" : "bg-muted"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Card Stack */}
          <div className="relative w-full max-w-md h-[600px]">
            <AnimatePresence mode="wait">
              {currentPost && (
                <motion.div
                  key={currentPost.id}
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ 
                    scale: 1, 
                    opacity: 1,
                    x: swipeDirection === "left" ? -300 : swipeDirection === "right" ? 300 : 0,
                    rotate: swipeDirection === "left" ? -15 : swipeDirection === "right" ? 15 : 0,
                  }}
                  exit={{ 
                    scale: 0.95, 
                    opacity: 0,
                    x: swipeDirection === "left" ? -300 : 300,
                  }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0"
                >
                  <Card className="glass-card h-full overflow-hidden border-2 border-white/10 hover:border-primary/30 transition-colors">
                    <CardContent className="p-0 h-full flex flex-col">
                      {/* Image */}
                      <div className="relative aspect-square bg-gradient-to-br from-muted to-background">
                        {currentPost.assets && currentPost.assets.length > 0 ? (
                          <img
                            src={currentPost.assets[0].public_url || ""}
                            alt="Post preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                            <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={uploading}
                                className="glass-button"
                                onClick={() => document.getElementById("file-upload")?.click()}
                              >
                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={generating}
                                className="glass-button"
                                onClick={handleGenerateImage}
                              >
                                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* Date badge */}
                        {currentPost.scheduled_at && (
                          <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-sm">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(currentPost.scheduled_at), "EEE, dd. MMM", { locale: de })}
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 p-6 flex flex-col">
                        <p className="text-foreground leading-relaxed line-clamp-6 flex-1">
                          {currentPost.caption}
                        </p>
                        <p className="text-primary text-sm mt-4 line-clamp-2">
                          {currentPost.hashtags}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
            
            <input
              id="file-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-6 mt-8">
            <Button
              size="lg"
              variant="outline"
              className={cn(
                "h-16 w-16 rounded-full border-2 border-destructive/50 hover:bg-destructive/20 hover:border-destructive transition-all",
                "shadow-lg hover:shadow-destructive/25"
              )}
              onClick={handleReject}
              disabled={saving || !currentPost}
            >
              <X className="h-8 w-8 text-destructive" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={openEditDialog}
              disabled={!currentPost}
            >
              Bearbeiten
            </Button>

            <Button
              size="lg"
              className={cn(
                "h-16 w-16 rounded-full border-2 border-success/50",
                "bg-gradient-to-br from-success/20 to-emerald-500/20",
                "hover:from-success/30 hover:to-emerald-500/30 hover:border-success",
                "shadow-lg hover:shadow-success/25 transition-all"
              )}
              onClick={handleApprove}
              disabled={saving || !currentPost}
            >
              <Check className="h-8 w-8 text-success" />
            </Button>
          </div>

          {/* Navigation arrows */}
          <div className="flex items-center gap-4 mt-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Zurück
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentIndex(Math.min(posts.length - 1, currentIndex + 1))}
              disabled={currentIndex >= posts.length - 1}
            >
              Weiter
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post bearbeiten</DialogTitle>
          </DialogHeader>

          {currentPost && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="caption">Caption</Label>
                <Textarea
                  id="caption"
                  value={editedCaption}
                  onChange={(e) => setEditedCaption(e.target.value)}
                  className="min-h-[200px] glass-input"
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
                  className="min-h-[80px] text-primary glass-input"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1">
                  Abbrechen
                </Button>
                <Button onClick={handleApprove} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  Speichern & Einplanen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
