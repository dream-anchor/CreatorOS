import { useEffect, useState, useRef, useCallback } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost, apiPatch, apiDelete, getPresignedUrl, uploadToR2, deleteFromR2 } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Post, Asset } from "@/types/database";
import { toast } from "sonner";
import { Loader2, Calendar as CalendarIcon, Clock, Recycle, X, Plus, GripVertical, ImageIcon, Trash2, Maximize2, Minimize2, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { format, startOfWeek, endOfWeek, addDays, isSameDay } from "date-fns";
import { de } from "date-fns/locale";
import { CollaboratorAutocomplete } from "@/components/CollaboratorAutocomplete";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function CalendarPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<(Post & { assets?: Asset[] })[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  // Replaces dialogOpen - expandedPostId tracks which card is expanded
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  
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
  const globalDragCounterRef = useRef(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<Array<{ id: string; title: string; date: string; venue: string; city: string }>>([]);

  // Helper to get current expanded post object
  const expandedPost = posts.find(p => p.id === expandedPostId);

  useEffect(() => {
    if (user) loadPosts();
  }, [user]);

  // Handle global drag for expanded post
  useEffect(() => {
    if (!expandedPostId) return;

    const handleGlobalDragEnter = (e: DragEvent) => {
      e.preventDefault();
      globalDragCounterRef.current++;
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragActive(true);
      }
    };

    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleGlobalDragLeave = (e: DragEvent) => {
      e.preventDefault();
      globalDragCounterRef.current--;
      if (globalDragCounterRef.current === 0) {
        setIsDragActive(false);
      }
    };

    const handleGlobalDrop = async (e: DragEvent) => {
      e.preventDefault();
      globalDragCounterRef.current = 0;
      setIsDragActive(false);

      if (!expandedPost || !user || expandedPost.status === "PUBLISHED") return;

      const files = Array.from(e.dataTransfer?.files || []);
      const imageFiles = files.filter(f => f.type.startsWith('image/'));

      if (imageFiles.length === 0) return;

      setUploadingImage(true);
      try {
        for (const file of imageFiles) {
          const ext = file.name.split(".").pop();
          const path = `${user.id}/${expandedPost.id}/${crypto.randomUUID()}.${ext}`;

          const { urls } = await getPresignedUrl([{ fileName: path, contentType: file.type, folder: "post-assets" }]);
          await uploadToR2(urls[0].uploadUrl, file, file.type);

          const newAsset = await apiPost<Asset>("/api/posts/assets", {
            user_id: user.id,
            post_id: expandedPost.id,
            storage_path: urls[0].key,
            public_url: urls[0].publicUrl,
            source: "upload",
          });

          setPostAssets((prev) => [...prev, newAsset]);
        }
        toast.success(`${imageFiles.length} Bild(er) hinzugefügt`);
      } catch (error: any) {
        toast.error("Fehler: " + error.message);
      } finally {
        setUploadingImage(false);
      }
    };

    window.addEventListener('dragenter', handleGlobalDragEnter);
    window.addEventListener('dragover', handleGlobalDragOver);
    window.addEventListener('dragleave', handleGlobalDragLeave);
    window.addEventListener('drop', handleGlobalDrop);

    return () => {
      window.removeEventListener('dragenter', handleGlobalDragEnter);
      window.removeEventListener('dragover', handleGlobalDragOver);
      window.removeEventListener('dragleave', handleGlobalDragLeave);
      window.removeEventListener('drop', handleGlobalDrop);
    };
  }, [expandedPostId, expandedPost, user]);

  const loadPosts = async () => {
    try {
      const [data, eventsData] = await Promise.all([
        apiGet<any[]>("/api/posts", { status: "APPROVED,SCHEDULED,PUBLISHED", include: "assets", order: "scheduled_at:asc" }),
        apiGet<any[]>("/api/events").catch(() => []),
      ]);

      const postsWithSortedAssets = (data || []).map(post => ({
        ...post,
        assets: (post.assets || []).sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      }));

      setPosts(postsWithSortedAssets as (Post & { assets?: Asset[] })[]);
      setCalendarEvents((eventsData || []) as Array<{ id: string; title: string; date: string; venue: string; city: string }>);
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate 3 weeks of days (21 days total)
  const allDays = Array.from({ length: 21 }, (_, i) => addDays(currentWeekStart, i));
  const weeks = [
    allDays.slice(0, 7),
    allDays.slice(7, 14),
    allDays.slice(14, 21),
  ];

  const getPostsForDay = (day: Date) => {
    return posts.filter((post) => {
      if (!post.scheduled_at) return false;
      return isSameDay(new Date(post.scheduled_at), day);
    });
  };

  const getEventsForDay = (day: Date) => {
    return calendarEvents.filter((ev) => {
      if (!ev.date) return false;
      return isSameDay(new Date(ev.date + "T00:00:00"), day);
    });
  };

  const getUnscheduledApproved = () => {
    return posts.filter((post) => post.status === "APPROVED" && !post.scheduled_at);
  };

  const handleExpandPost = (post: Post & { assets?: Asset[] }) => {
    if (expandedPostId === post.id) {
      setExpandedPostId(null); // Collapse if already expanded
      return;
    }
    
    setExpandedPostId(post.id);
    setEditCaption(post.caption || "");
    setPostAssets(post.assets || []);
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
  };

  const handleCloseExpanded = () => {
    setExpandedPostId(null);
  };

  const handleDeleteAsset = async (asset: Asset) => {
    try {
      // Delete from storage
      await deleteFromR2(asset.storage_path);

      // Delete from database
      await apiDelete(`/api/posts/assets/${asset.id}`);

      setPostAssets((prev) => prev.filter((a) => a.id !== asset.id));
      toast.success("Bild gelöscht");
    } catch (error: any) {
      toast.error("Fehler beim Löschen: " + error.message);
    }
  };

  const handleAddImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !expandedPost || !user) return;

    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${expandedPost.id}/${crypto.randomUUID()}.${ext}`;

      const { urls } = await getPresignedUrl([{ fileName: path, contentType: file.type, folder: "post-assets" }]);
      await uploadToR2(urls[0].uploadUrl, file, file.type);

      const newAsset = await apiPost<Asset>("/api/posts/assets", {
        user_id: user.id,
        post_id: expandedPost.id,
        storage_path: urls[0].key,
        public_url: urls[0].publicUrl,
        source: "upload",
      });

      setPostAssets((prev) => [...prev, newAsset]);
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
    if (!expandedPost || !scheduleDate || !scheduleTime) return;

    setSaving(true);
    try {
      const scheduledAt = new Date(`${scheduleDate}T${scheduleTime}:00`);

      // Save post with updated caption and collaborators
      await apiPatch(`/api/posts/${expandedPost.id}`, {
        status: "SCHEDULED",
        scheduled_at: scheduledAt.toISOString(),
        caption: editCaption,
        collaborators: collaborators,
      });

      // Save the new asset order by updating created_at timestamps
      // Assets are ordered by created_at in the query, so we update them in sequence
      for (let i = 0; i < postAssets.length; i++) {
        const newTimestamp = new Date(Date.now() + i * 1000).toISOString();
        await apiPatch(`/api/posts/assets/${postAssets[i].id}`, { created_at: newTimestamp });
      }

      toast.success("Post geplant!");
      setExpandedPostId(null);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnschedule = async () => {
    if (!expandedPost) return;

    setSaving(true);
    try {
      await apiPatch(`/api/posts/${expandedPost.id}`, {
        status: "APPROVED",
        scheduled_at: null,
      });

      toast.success("Planung aufgehoben");
      setExpandedPostId(null);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async () => {
    if (!expandedPost) return;

    setDeleting(true);
    try {
      // Delete associated assets first
      for (const asset of postAssets) {
        await deleteFromR2(asset.storage_path);
        await apiDelete(`/api/posts/assets/${asset.id}`);
      }

      // Delete the post
      await apiDelete(`/api/posts/${expandedPost.id}`);

      toast.success("Post gelöscht");
      setExpandedPostId(null);
      loadPosts();
    } catch (error: any) {
      toast.error("Fehler beim Löschen: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  // Drag & Drop handlers for moving posts between days
  const handlePostDragStart = (e: React.DragEvent, postId: string) => {
    const post = posts.find(p => p.id === postId);
    // Prevent dragging published posts
    if (post?.status === "PUBLISHED") {
      e.preventDefault();
      return;
    }
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

    // Prevent moving published posts
    if (post.status === "PUBLISHED") {
      toast.error("Veröffentlichte Posts können nicht verschoben werden");
      setDraggedPost(null);
      return;
    }

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

      await apiPatch(`/api/posts/${post.id}`, {
        scheduled_at: newScheduledAt.toISOString(),
        status: newStatus,
      });

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
        {/* Header with minimal controls */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">Planung</h1>
            <div className="h-6 w-px bg-border/50 mx-2" />
            <div className="flex items-center gap-2 bg-muted/30 rounded-full px-1 p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full hover:bg-background shadow-sm transition-all"
                onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -21))}
              >
                ←
              </Button>
              <span className="text-sm font-medium px-2 min-w-[140px] text-center tabular-nums">
                {format(currentWeekStart, "d. MMM", { locale: de })} –{" "}
                {format(addDays(currentWeekStart, 20), "d. MMM", { locale: de })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full hover:bg-background shadow-sm transition-all"
                onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 21))}
              >
                →
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6">
          {/* Unscheduled "Idea Stream" */}
          <div className="order-2 xl:order-1 xl:w-80 flex-shrink-0">
            <div className="sticky top-6 space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Ideen & Entwürfe</h3>
                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                  {getUnscheduledApproved().length}
                </Badge>
              </div>
              
              <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-2 scrollbar-hide">
                <AnimatePresence>
                  {getUnscheduledApproved().length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }}
                      className="p-8 border-2 border-dashed border-border/50 rounded-2xl text-center"
                    >
                      <p className="text-sm text-muted-foreground">
                        Keine offenen Posts.<br/>Erstelle neue im Generator!
                      </p>
                    </motion.div>
                  ) : (
                    getUnscheduledApproved().map((post) => (
                      <motion.div
                        layoutId={post.id}
                        key={post.id}
                        draggable
                        onDragStart={(e) => handlePostDragStart(e as any, post.id)}
                        onDragEnd={handlePostDragEnd}
                        onClick={() => handleExpandPost(post)}
                        className={cn(
                          "group relative bg-card hover:bg-accent/5 border border-border/50 hover:border-primary/20 rounded-2xl p-4 cursor-pointer transition-all duration-300",
                          draggedPost === post.id && "opacity-50 scale-95 rotate-2 shadow-xl",
                          expandedPostId === post.id && "ring-2 ring-primary ring-offset-2 z-10"
                        )}
                        whileHover={{ y: -2, scale: 1.01 }}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <StatusBadge status={post.status} />
                          {post.remixed_from_id && (
                            <div className="p-1 rounded-full bg-orange-500/10 text-orange-500">
                              <Recycle className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-medium leading-relaxed line-clamp-3 text-card-foreground/90">
                          {post.caption || "Ohne Titel"}
                        </p>
                        
                        {/* Expandable Content for Unscheduled */}
                        <AnimatePresence>
                          {expandedPostId === post.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-4 mt-4 border-t border-border/50 space-y-4">
                                <div className="space-y-2">
                                  <Label className="text-xs">Planen für</Label>
                                  <div className="flex gap-2">
                                    <Input 
                                      type="date" 
                                      value={scheduleDate} 
                                      onChange={(e) => setScheduleDate(e.target.value)}
                                      className="h-8 text-xs bg-muted/30"
                                    />
                                    <Input 
                                      type="time" 
                                      value={scheduleTime} 
                                      onChange={(e) => setScheduleTime(e.target.value)}
                                      className="h-8 text-xs bg-muted/30 w-24"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={(e) => { e.stopPropagation(); handleSchedule(); }} className="w-full h-8 text-xs">
                                    Planen
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Fluid Calendar Grid */}
          <div className="order-1 xl:order-2 flex-1 min-w-0">
            <div className="space-y-8">
              {weeks.map((weekDays, weekIndex) => (
                <div key={weekIndex} className="space-y-2">
                  {/* Week Header - Minimal */}
                  {weekIndex === 0 && (
                     <div className="grid grid-cols-7 gap-4 px-2 mb-2">
                       {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map(d => (
                         <div key={d} className="text-xs font-medium text-muted-foreground uppercase text-center">{d}</div>
                       ))}
                     </div>
                  )}
                  
                  <div className="grid grid-cols-7 gap-2 lg:gap-3">
                    {weekDays.map((day) => {
                      const dayPosts = getPostsForDay(day);
                      const isToday = isSameDay(day, new Date());
                      const dayKey = day.toISOString();
                      const isDragOver = dragOverDay === dayKey;
                      const isPast = day < new Date() && !isToday;

                      return (
                        <div
                          key={dayKey}
                          onDragOver={(e) => handleDayDragOver(e, dayKey)}
                          onDragLeave={handleDayDragLeave}
                          onDrop={(e) => handleDayDrop(e, day)}
                          className={cn(
                            "relative min-h-[160px] group transition-all duration-300 rounded-2xl border",
                            isDragOver ? "border-primary bg-primary/5 scale-[1.02] shadow-lg ring-1 ring-primary" : "border-transparent bg-muted/20 hover:bg-muted/30",
                            isToday && "bg-background border-primary/20 shadow-sm ring-1 ring-primary/10",
                            isPast && "opacity-60 bg-muted/10"
                          )}
                        >
                          {/* Date Number */}
                          <div className={cn(
                            "absolute top-3 right-3 text-sm font-medium transition-colors",
                            isToday ? "text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground/70"
                          )}>
                            {format(day, "d")}
                          </div>

                          {/* Event Markers */}
                          {getEventsForDay(day).map((ev) => (
                            <div
                              key={ev.id}
                              className="mx-2 mt-8 mb-0.5 px-1.5 py-0.5 rounded-md bg-orange-500/15 border border-orange-500/25 text-[9px] font-medium text-orange-600 dark:text-orange-400 truncate"
                              title={`${ev.title} – ${ev.venue}, ${ev.city}`}
                            >
                              {ev.title}
                            </div>
                          ))}

                          {/* Posts Stack */}
                          <div className={`p-2 ${getEventsForDay(day).length > 0 ? "pt-1" : "pt-8"} space-y-2 h-full`}>
                            {dayPosts.map((post) => {
                              const isExpanded = expandedPostId === post.id;
                              
                              // If expanded, render the Immersive Edit Card overlay instead of the small pill
                              if (isExpanded) {
                                return (
                                  <motion.div
                                    layoutId={`card-${post.id}`}
                                    key={post.id}
                                    className="absolute inset-0 z-50 -m-2 sm:-m-4"
                                  >
                                    <div 
                                      className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
                                      onClick={handleCloseExpanded}
                                    />
                                    <Card className="relative z-50 w-[320px] sm:w-[400px] shadow-2xl border-primary/20 animate-in zoom-in-95 duration-200 origin-center mx-auto mt-[10vh]">
                                      <div className="absolute top-2 right-2 flex gap-1">
                                         <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive" onClick={handleDeletePost}>
                                           <Trash2 className="h-3 w-3" />
                                         </Button>
                                         <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={handleCloseExpanded}>
                                           <Minimize2 className="h-3 w-3" />
                                         </Button>
                                      </div>
                                      
                                      <CardContent className="p-0">
                                        {/* Immersive Image Area */}
                                        <div className="relative aspect-video bg-muted/30 border-b border-border/50 group/image">
                                           {postAssets.length > 0 ? (
                                             <img 
                                               src={postAssets[0].public_url || ""} 
                                               className="w-full h-full object-cover" 
                                             />
                                           ) : (
                                             <div className="flex items-center justify-center h-full text-muted-foreground/30">
                                               <ImageIcon className="h-8 w-8" />
                                             </div>
                                           )}
                                           
                                           {/* Drop Zone Overlay */}
                                           {isDragActive && (
                                              <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-sm border-2 border-primary border-dashed m-2 rounded-lg">
                                                <p className="text-primary font-bold">Bild ablegen</p>
                                              </div>
                                           )}
                                        </div>

                                        <div className="p-4 space-y-4">
                                          <div className="flex items-center justify-between">
                                            <div className="flex gap-2">
                                               <Input 
                                                 type="time" 
                                                 value={scheduleTime} 
                                                 onChange={(e) => setScheduleTime(e.target.value)}
                                                 className="h-8 w-24 bg-muted/30 border-none font-mono"
                                               />
                                            </div>
                                            <StatusBadge status={post.status} />
                                          </div>

                                          <Textarea 
                                            value={editCaption}
                                            onChange={(e) => setEditCaption(e.target.value)}
                                            className="min-h-[100px] border-none resize-none bg-transparent focus-visible:ring-0 p-0 text-base leading-relaxed"
                                            placeholder="Schreibe deine Caption..."
                                          />

                                          <div className="flex justify-between items-center pt-2 border-t border-border/30">
                                            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={handleUnschedule}>
                                              Zurück zu Ideen
                                            </Button>
                                            <Button size="sm" onClick={handleSchedule} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                                              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Check className="h-3 w-3 mr-2" />}
                                              Speichern
                                            </Button>
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  </motion.div>
                                );
                              }

                              return (
                                <motion.div
                                  layoutId={`card-${post.id}`}
                                  key={post.id}
                                  draggable={post.status !== "PUBLISHED"}
                                  onDragStart={(e) => handlePostDragStart(e as any, post.id)}
                                  onDragEnd={handlePostDragEnd}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExpandPost(post);
                                  }}
                                  className={cn(
                                    "p-2.5 rounded-xl bg-background border border-border/40 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all group/card",
                                    post.status === "PUBLISHED" && "opacity-70 grayscale-[0.3]"
                                  )}
                                  whileHover={{ y: -2 }}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                                      {post.scheduled_at ? format(new Date(post.scheduled_at), "HH:mm") : ""}
                                    </span>
                                    {post.status === "PUBLISHED" && <Check className="h-3 w-3 text-emerald-500" />}
                                  </div>
                                  <p className="text-xs font-medium mt-1.5 line-clamp-2 leading-snug">
                                    {post.caption}
                                  </p>
                                  {/* Asset Preview Dot */}
                                  {post.assets && post.assets.length > 0 && (
                                    <div className="mt-2 h-1 w-full bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-primary/50 w-1/3" />
                                    </div>
                                  )}
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}