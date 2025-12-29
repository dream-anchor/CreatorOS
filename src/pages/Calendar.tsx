import { useEffect, useState, useRef, useCallback } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Post, Asset } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Calendar as CalendarIcon, Clock, Recycle, X, Plus, GripVertical, ImageIcon, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { format, startOfWeek, endOfWeek, addDays, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { CollaboratorAutocomplete } from "@/components/CollaboratorAutocomplete";

export default function CalendarPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<(Post & { assets?: Asset[] })[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedPost, setSelectedPost] = useState<(Post & { assets?: Asset[] }) | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("12:00");
  const [editCaption, setEditCaption] = useState("");
  const [postAssets, setPostAssets] = useState<Asset[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [draggedPost, setDraggedPost] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) loadPosts();
  }, [user]);

  const loadPosts = async () => {
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("*, assets(*)")
        .in("status", ["APPROVED", "SCHEDULED", "PUBLISHED"])
        .order("scheduled_at", { ascending: true });

      
      // Sort assets by created_at to maintain order
      const postsWithSortedAssets = (data || []).map(post => ({
        ...post,
        assets: (post.assets || []).sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      }));
      
      setPosts(postsWithSortedAssets as (Post & { assets?: Asset[] })[]);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));

  const getPostsForDay = (day: Date) => {
    return posts.filter((post) => {
      if (!post.scheduled_at) return false;
      return isSameDay(new Date(post.scheduled_at), day);
    });
  };

  const getUnscheduledApproved = () => {
    return posts.filter((post) => post.status === "APPROVED" && !post.scheduled_at);
  };

  const openScheduleDialog = (post: Post & { assets?: Asset[] }) => {
    setSelectedPost(post);
    setEditCaption(post.caption || "");
    // Ensure assets are properly loaded
    const assets = post.assets || [];
    console.log("Loading assets for post:", post.id, assets);
    setPostAssets(assets);
    // Load collaborators
    const postCollaborators = (post as any).collaborators || [];
    setCollaborators(postCollaborators);
    if (post.scheduled_at) {
      const date = new Date(post.scheduled_at);
      setScheduleDate(format(date, "yyyy-MM-dd"));
      setScheduleTime(format(date, "HH:mm"));
    } else {
      setScheduleDate(format(new Date(), "yyyy-MM-dd"));
      setScheduleTime("12:00");
    }
    setDialogOpen(true);
  };

  const handleDeleteAsset = async (asset: Asset) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("post-assets")
        .remove([asset.storage_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("assets")
        .delete()
        .eq("id", asset.id);

      if (dbError) throw dbError;

      setPostAssets((prev) => prev.filter((a) => a.id !== asset.id));
      toast.success("Bild gelöscht");
    } catch (error: any) {
      toast.error("Fehler beim Löschen: " + error.message);
    }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPost || !user) return;

    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${selectedPost.id}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("post-assets")
        .upload(path, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("post-assets")
        .getPublicUrl(path);

      const { data: newAsset, error: dbError } = await supabase
        .from("assets")
        .insert({
          user_id: user.id,
          post_id: selectedPost.id,
          storage_path: path,
          public_url: urlData.publicUrl,
          source: "upload",
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setPostAssets((prev) => [...prev, newAsset as Asset]);
      toast.success("Bild hinzugefügt");
    } catch (error: any) {
      toast.error("Fehler beim Hochladen: " + error.message);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Drag and drop handlers for reordering
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    setPostAssets((prev) => {
      const newAssets = [...prev];
      const draggedItem = newAssets[draggedIndex];
      newAssets.splice(draggedIndex, 1);
      newAssets.splice(index, 0, draggedItem);
      return newAssets;
    });
    setDraggedIndex(index);
  }, [draggedIndex]);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // Touch-based reordering for mobile
  const moveAsset = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= postAssets.length) return;
    setPostAssets((prev) => {
      const newAssets = [...prev];
      const item = newAssets[fromIndex];
      newAssets.splice(fromIndex, 1);
      newAssets.splice(toIndex, 0, item);
      return newAssets;
    });
  }, [postAssets.length]);

  const handleSchedule = async () => {
    if (!selectedPost || !scheduleDate || !scheduleTime) return;

    setSaving(true);
    try {
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);

      // Save post with updated caption and collaborators
      const { error } = await supabase
        .from("posts")
        .update({
          status: "SCHEDULED",
          scheduled_at: scheduledAt.toISOString(),
          caption: editCaption,
          collaborators: collaborators,
        })
        .eq("id", selectedPost.id);

      if (error) throw error;

      // Save the new asset order by updating created_at timestamps
      // Assets are ordered by created_at in the query, so we update them in sequence
      for (let i = 0; i < postAssets.length; i++) {
        const newTimestamp = new Date(Date.now() + i * 1000).toISOString();
        await supabase
          .from("assets")
          .update({ created_at: newTimestamp })
          .eq("id", postAssets[i].id);
      }

      await supabase.from("logs").insert({
        user_id: user!.id,
        post_id: selectedPost.id,
        event_type: "post_scheduled",
        level: "info",
        details: { scheduled_at: scheduledAt.toISOString() },
      });

      toast.success("Post geplant!");
      setDialogOpen(false);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnschedule = async () => {
    if (!selectedPost) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("posts")
        .update({
          status: "APPROVED",
          scheduled_at: null,
        })
        .eq("id", selectedPost.id);

      if (error) throw error;

      toast.success("Planung aufgehoben");
      setDialogOpen(false);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async () => {
    if (!selectedPost) return;

    setDeleting(true);
    try {
      // Delete associated assets first
      for (const asset of postAssets) {
        await supabase.storage
          .from("post-assets")
          .remove([asset.storage_path]);
        
        await supabase
          .from("assets")
          .delete()
          .eq("id", asset.id);
      }

      // Delete the post
      const { error } = await supabase
        .from("posts")
        .delete()
        .eq("id", selectedPost.id);

      if (error) throw error;

      toast.success("Post gelöscht");
      setDialogOpen(false);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler beim Löschen: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  // Drag & Drop handlers for moving posts between days
  const handlePostDragStart = (e: React.DragEvent, postId: string) => {
    setDraggedPost(postId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", postId);
  };

  const handleDayDragOver = (e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    if (draggedPost) {
      setDragOverDay(dayKey);
    }
  };

  const handleDayDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDayDrop = async (e: React.DragEvent, targetDay: Date) => {
    e.preventDefault();
    setDragOverDay(null);
    
    if (!draggedPost) return;
    
    const post = posts.find(p => p.id === draggedPost);
    if (!post) return;

    try {
      // Keep the same time, just change the date
      let newScheduledAt: Date;
      if (post.scheduled_at) {
        const oldDate = new Date(post.scheduled_at);
        newScheduledAt = new Date(targetDay);
        newScheduledAt.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
      } else {
        // Default to 12:00 if no previous time
        newScheduledAt = new Date(targetDay);
        newScheduledAt.setHours(12, 0, 0, 0);
      }

      const newStatus = post.status === "APPROVED" ? "SCHEDULED" : post.status;

      const { error } = await supabase
        .from("posts")
        .update({
          scheduled_at: newScheduledAt.toISOString(),
          status: newStatus,
        })
        .eq("id", post.id);

      if (error) throw error;

      toast.success(`Post auf ${format(targetDay, "d. MMM", { locale: de })} verschoben`);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setDraggedPost(null);
    }
  };

  const handlePostDragEnd = () => {
    setDraggedPost(null);
    setDragOverDay(null);
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
        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-4 lg:mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))}
          >
            ← Vorherige
          </Button>
          <div className="flex items-center gap-2 text-sm sm:text-base font-medium">
            <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <span>
              {format(currentWeekStart, "d. MMM", { locale: de })} –{" "}
              {format(endOfWeek(currentWeekStart, { weekStartsOn: 1 }), "d. MMM yyyy", { locale: de })}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))}
          >
            Nächste →
          </Button>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 lg:gap-6">
          {/* Unscheduled Posts - Below on mobile, left on desktop */}
          <div className="order-2 xl:order-1 xl:w-72 flex-shrink-0">
            <Card className="glass-card h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  Bereit zur Planung
                  <Badge variant="secondary" className="ml-2">
                    {getUnscheduledApproved().length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[250px] xl:max-h-[calc(100vh-300px)] overflow-y-auto">
                {getUnscheduledApproved().length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Keine genehmigten Posts
                  </p>
                ) : (
                  getUnscheduledApproved().map((post) => (
                    <div
                      key={post.id}
                      draggable
                      onDragStart={(e) => handlePostDragStart(e, post.id)}
                      onDragEnd={handlePostDragEnd}
                      onClick={() => openScheduleDialog(post)}
                      className={`p-3 rounded-lg border border-border hover:border-primary/50 cursor-grab active:cursor-grabbing transition-all ${
                        draggedPost === post.id ? "opacity-50 scale-95" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                        <StatusBadge status={post.status} />
                        {post.remixed_from_id && (
                          <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                            <Recycle className="h-3 w-3 mr-1" />
                            Remix
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mt-2 line-clamp-2 pl-6">{post.caption}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Week Calendar - Full width */}
          <div className="order-1 xl:order-2 flex-1 min-w-0">
            <Card className="glass-card">
              <CardContent className="p-4 sm:p-5 lg:p-6">
                {/* Always 7 columns on desktop for proper week view */}
                <div className="grid grid-cols-7 gap-2 lg:gap-3">
                  {weekDays.map((day) => {
                    const dayPosts = getPostsForDay(day);
                    const isToday = isSameDay(day, new Date());
                    const dayKey = day.toISOString();
                    const isDragOver = dragOverDay === dayKey;

                    return (
                      <div
                        key={dayKey}
                        onDragOver={(e) => handleDayDragOver(e, dayKey)}
                        onDragLeave={handleDayDragLeave}
                        onDrop={(e) => handleDayDrop(e, day)}
                        className={`min-h-[180px] lg:min-h-[220px] p-2 lg:p-3 rounded-xl border-2 transition-all ${
                          isDragOver 
                            ? "border-primary bg-primary/10 scale-[1.02]" 
                            : isToday 
                            ? "border-primary bg-primary/5" 
                            : "border-border/50 hover:border-border"
                        }`}
                      >
                        <div className="text-center mb-3">
                          <p className="text-[10px] lg:text-xs text-muted-foreground uppercase tracking-wide">
                            {format(day, "EEE", { locale: de })}
                          </p>
                          <p
                            className={`text-xl lg:text-3xl font-bold ${
                              isToday ? "text-primary" : ""
                            }`}
                          >
                            {format(day, "d")}
                          </p>
                        </div>
                        <div className="space-y-2 max-h-[120px] lg:max-h-[150px] overflow-y-auto">
                          {dayPosts.map((post) => (
                            <div
                              key={post.id}
                              draggable
                              onDragStart={(e) => handlePostDragStart(e, post.id)}
                              onDragEnd={handlePostDragEnd}
                              onClick={(e) => {
                                e.stopPropagation();
                                openScheduleDialog(post);
                              }}
                              className={`p-2 rounded-lg bg-muted/60 hover:bg-muted cursor-grab active:cursor-grabbing transition-all ${
                                draggedPost === post.id ? "opacity-50" : ""
                              }`}
                            >
                              <div className="flex items-center gap-1 mb-1">
                                <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                <span className="text-xs text-muted-foreground font-medium">
                                  {post.scheduled_at &&
                                    format(new Date(post.scheduled_at), "HH:mm")}
                                </span>
                              </div>
                              <span className={`inline-block text-[10px] lg:text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                post.status === "PUBLISHED" 
                                  ? "bg-emerald-500/20 text-emerald-600" 
                                  : post.status === "SCHEDULED"
                                  ? "bg-primary/20 text-primary"
                                  : "bg-muted-foreground/20 text-muted-foreground"
                              }`}>
                                {post.status === "PUBLISHED" ? "Veröff." : post.status === "SCHEDULED" ? "Geplant" : post.status}
                              </span>
                              <p className="text-xs line-clamp-2 mt-1 leading-tight">{post.caption}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

      {/* Schedule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post planen</DialogTitle>
          </DialogHeader>

          {selectedPost && (
            <div className="space-y-4">
              {/* Images Section */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4" />
                  Bilder ({postAssets.length})
                </Label>
                
                {postAssets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border rounded-lg bg-muted/30">
                    <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">Keine Bilder vorhanden</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Bild hinzufügen
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {postAssets.map((asset, index) => (
                      <div
                        key={asset.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          draggedIndex === index
                            ? "border-primary opacity-50"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        {/* Drag Handle */}
                        <div className="absolute top-1 left-1 z-10 bg-background/80 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                          <GripVertical className="h-3 w-3 text-muted-foreground" />
                        </div>
                        
                        {/* Position indicator */}
                        <div className="absolute top-1 right-1 z-10 bg-background/80 rounded px-1.5 py-0.5 text-[10px] font-medium">
                          {index + 1}
                        </div>

                        <img
                          src={asset.public_url || ""}
                          alt={`Bild ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                        
                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAsset(asset);
                          }}
                          className="absolute bottom-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90"
                        >
                          <X className="h-3 w-3" />
                        </button>

                        {/* Mobile reorder buttons */}
                        <div className="absolute bottom-1 left-1 flex gap-1 sm:hidden">
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveAsset(index, index - 1);
                              }}
                              className="bg-background/80 rounded px-1.5 py-0.5 text-[10px]"
                            >
                              ←
                            </button>
                          )}
                          {index < postAssets.length - 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveAsset(index, index + 1);
                              }}
                              className="bg-background/80 rounded px-1.5 py-0.5 text-[10px]"
                            >
                              →
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    {/* Add Image Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="aspect-square border-2 border-dashed border-border rounded-lg flex items-center justify-center hover:border-primary/50 hover:bg-muted/50 transition-all"
                    >
                      {uploadingImage ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <Plus className="h-5 w-5 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                )}
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAddImage}
                  className="hidden"
                />
                
                {postAssets.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Ziehe Bilder um die Reihenfolge zu ändern
                  </p>
                )}
              </div>

              {/* Caption */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedPost.status} />
                </div>
                <Label htmlFor="caption">Caption</Label>
                <Textarea
                  id="caption"
                  value={editCaption}
                  onChange={(e) => setEditCaption(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* Collaborators */}
              <CollaboratorAutocomplete
                collaborators={collaborators}
                onChange={setCollaborators}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="date">Datum</Label>
                  <Input
                    id="date"
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Uhrzeit</Label>
                  <Input
                    id="time"
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  {selectedPost.status === "SCHEDULED" && (
                    <Button
                      variant="outline"
                      onClick={handleUnschedule}
                      disabled={saving || deleting}
                      className="flex-1"
                    >
                      Planung aufheben
                    </Button>
                  )}
                  <Button onClick={handleSchedule} disabled={saving || deleting} className="flex-1">
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {selectedPost.status === "SCHEDULED" ? "Aktualisieren" : "Planen"}
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  onClick={handleDeletePost}
                  disabled={saving || deleting}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {deleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Post löschen
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </GlobalLayout>
  );
}