import { useState, useEffect, useCallback } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  RefreshCw,
  Loader2,
  Sparkles,
  Trash2,
  Send,
  User,
  Clock,
  Image as ImageIcon,
  Brain,
  AlertCircle,
} from "lucide-react";
import { formatDistanceToNow, format, addMinutes, subMinutes } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AiModelSelector, AI_MODELS } from "@/components/community/AiModelSelector";

interface Comment {
  id: string;
  comment_text: string;
  commenter_username: string | null;
  comment_timestamp: string;
  ai_reply_suggestion: string | null;
  ig_comment_id: string;
  ig_media_id: string;
  post?: {
    id: string;
    caption: string | null;
    original_media_url: string | null;
  } | null;
}

interface GeneratedReply {
  text: string;
  model: string;
}

export default function Community() {
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelForReplies, setModelForReplies] = useState<string | null>(null);
  const [generatedReplies, setGeneratedReplies] = useState<Record<string, GeneratedReply>>({});
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number } | null>(null);
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  // Fetch comments with post context
  const { data: comments = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['community-comments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_comments")
        .select(`
          id, 
          comment_text, 
          commenter_username, 
          comment_timestamp, 
          ai_reply_suggestion, 
          ig_comment_id, 
          ig_media_id,
          post:posts!instagram_comments_post_id_fkey (
            id,
            caption,
            original_media_url
          )
        `)
        .eq("is_replied", false)
        .eq("is_hidden", false)
        .order("comment_timestamp", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as Comment[];
    },
    staleTime: 30000,
  });

  // Sync replyTexts with generatedReplies
  useEffect(() => {
    const newTexts: Record<string, string> = {};
    Object.entries(generatedReplies).forEach(([id, reply]) => {
      newTexts[id] = reply.text;
    });
    setReplyTexts(newTexts);
  }, [generatedReplies]);

  // Listen for refresh events from the chat
  useEffect(() => {
    const handleRefresh = () => {
      queryClient.invalidateQueries({ queryKey: ['community-comments'] });
    };
    
    window.addEventListener('refresh-comments', handleRefresh);
    return () => window.removeEventListener('refresh-comments', handleRefresh);
  }, [queryClient]);

  // Auto-generate replies when model is selected
  const handleGenerateAllReplies = useCallback(async (model: string) => {
    if (comments.length === 0) {
      toast.info("Keine Kommentare zum Generieren");
      return;
    }

    setIsAutoGenerating(true);
    setGenerationProgress({ current: 0, total: comments.length });
    const newReplies: Record<string, GeneratedReply> = {};
    const modelName = AI_MODELS.find(m => m.id === model)?.name || model;

    toast.info(`🧠 Generiere Antworten mit ${modelName}...`);

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      setGenerationProgress({ current: i + 1, total: comments.length });

      try {
        const { data, error } = await supabase.functions.invoke("regenerate-reply", {
          body: { comment_id: comment.id, model },
        });

        if (error) throw error;

        if (data?.new_reply) {
          newReplies[comment.id] = { text: data.new_reply, model };
        }
      } catch (err) {
        console.error(`Error generating for ${comment.id}:`, err);
      }

      // Small delay between requests to avoid rate limiting
      if (i < comments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    setGeneratedReplies(newReplies);
    setModelForReplies(model);
    setIsAutoGenerating(false);
    setGenerationProgress(null);

    const successCount = Object.keys(newReplies).length;
    toast.success(`✨ ${successCount} von ${comments.length} Antworten generiert!`);
    refetch();
  }, [comments, refetch]);

  // Handle model change - triggers auto-generation
  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
    
    // If switching models, clear and regenerate
    if (model !== modelForReplies) {
      setGeneratedReplies({});
      setReplyTexts({});
      handleGenerateAllReplies(model);
    }
  }, [modelForReplies, handleGenerateAllReplies]);

  // Fetch new comments from Instagram
  const handleFetchComments = async () => {
    toast.info("🔄 Lade Kommentare von Instagram...");
    
    try {
      const { error } = await supabase.functions.invoke("fetch-comments");
      if (error) throw error;
      
      toast.success("✅ Kommentare geladen!");
      refetch();
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Fehler beim Laden der Kommentare");
    }
  };

  // Send reply with Golden Window scheduling
  const handleSendReply = async (comment: Comment) => {
    const replyText = replyTexts[comment.id]?.trim();
    if (!replyText) {
      toast.error("Bitte erst eine Antwort schreiben!");
      return;
    }
    
    setSendingReply(comment.id);
    
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Nicht eingeloggt");

      // Get next scheduled post for Golden Window
      const { data: nextPost } = await supabase
        .from("posts")
        .select("scheduled_at")
        .gt("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let scheduledFor: string | null = null;
      let schedulingInfo = "sofort";

      if (nextPost?.scheduled_at) {
        const postTime = new Date(nextPost.scheduled_at);
        
        // Get count of existing pending replies to alternate
        const { count } = await supabase
          .from("comment_reply_queue")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.user.id)
          .eq("status", "pending");

        // Alternate: even = before, odd = after
        const isEven = (count || 0) % 2 === 0;
        const targetTime = isEven 
          ? subMinutes(postTime, 15) 
          : addMinutes(postTime, 15);
        
        scheduledFor = targetTime.toISOString();
        schedulingInfo = `${format(targetTime, "HH:mm", { locale: de })} (${isEven ? "vor" : "nach"} Post)`;
      }

      // Add to reply queue with scheduling
      const { error: queueError } = await supabase
        .from("comment_reply_queue")
        .insert({
          user_id: user.user.id,
          ig_comment_id: comment.ig_comment_id,
          comment_id: comment.id,
          reply_text: replyText,
          status: scheduledFor ? "pending" : "pending",
          scheduled_for: scheduledFor,
        });
      
      if (queueError) throw queueError;
      
      // Mark comment as replied
      await supabase
        .from("instagram_comments")
        .update({ is_replied: true, ai_reply_suggestion: replyText })
        .eq("id", comment.id);
      
      toast.success(`✅ Geplant für ${schedulingInfo}`);
      
      // Remove from local state
      setGeneratedReplies(prev => {
        const next = { ...prev };
        delete next[comment.id];
        return next;
      });
      setReplyTexts(prev => {
        const next = { ...prev };
        delete next[comment.id];
        return next;
      });
      
      refetch();
    } catch (err) {
      console.error("Send error:", err);
      toast.error("Fehler beim Senden");
    } finally {
      setSendingReply(null);
    }
  };

  // Delete/ignore a comment
  const handleDelete = async (commentId: string) => {
    setDeletingComment(commentId);
    
    try {
      const { error } = await supabase
        .from("instagram_comments")
        .update({ is_hidden: true })
        .eq("id", commentId);
      
      if (error) throw error;
      
      // Remove from local state
      setGeneratedReplies(prev => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
      
      toast.success("Kommentar ignoriert");
      refetch();
    } catch (err) {
      console.error("Delete error:", err);
      toast.error("Fehler beim Löschen");
    } finally {
      setDeletingComment(null);
    }
  };

  // Update reply text
  const handleReplyTextChange = (commentId: string, text: string) => {
    setReplyTexts(prev => ({ ...prev, [commentId]: text }));
  };

  if (isLoading) {
    return (
      <GlobalLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </GlobalLayout>
    );
  }

  const noModelSelected = !selectedModel;

  return (
    <GlobalLayout>
      <div className="p-6 max-w-5xl mx-auto pb-32">
        {/* Header with Model Selector */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-white" />
              </div>
              Community
            </h1>
            <p className="text-sm text-muted-foreground mt-2 ml-[52px]">
              {comments.length} offene Kommentare warten auf deine Antwort
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <AiModelSelector
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              disabled={isAutoGenerating}
              isGenerating={isAutoGenerating}
              generationProgress={generationProgress}
            />
            <Button
              onClick={handleFetchComments}
              disabled={isRefetching}
              variant="outline"
              className="gap-2 rounded-xl h-10"
            >
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </div>
        </div>

        {/* No Model Selected Prompt */}
        {noModelSelected && comments.length > 0 && (
          <Card className="mb-6 border-primary/50 bg-primary/5 rounded-2xl">
            <CardContent className="flex items-center gap-4 py-5">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">KI-Modell auswählen</h3>
                <p className="text-sm text-muted-foreground">
                  Wähle oben rechts ein Modell, um automatisch Smart Replies für alle {comments.length} Kommentare zu generieren.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {comments.length === 0 ? (
          <Card className="border-dashed border-2 rounded-2xl">
            <CardContent className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-6">
                <MessageCircle className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Keine offenen Kommentare</h2>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Alle Kommentare bearbeitet oder noch keine von Instagram geladen.
              </p>
              <Button onClick={handleFetchComments} size="lg" className="gap-2 rounded-xl">
                <RefreshCw className="h-4 w-4" />
                Kommentare jetzt abrufen
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Comments List */
          <div className="space-y-4">
            {comments.map((comment) => {
              const generatedReply = generatedReplies[comment.id];
              const hasReply = !!replyTexts[comment.id]?.trim();
              
              return (
                <Card 
                  key={comment.id} 
                  className={cn(
                    "overflow-hidden rounded-2xl border-border/50 transition-all hover:shadow-lg",
                    noModelSelected && "opacity-75",
                    generatedReply && "border-primary/30 hover:border-primary/50"
                  )}
                >
                  <CardContent className="p-0">
                    {/* Post Context Header */}
                    {comment.post && (
                      <div className="flex items-center gap-3 px-5 py-3 bg-muted/30 border-b border-border/30">
                        {comment.post.original_media_url ? (
                          <img 
                            src={comment.post.original_media_url} 
                            alt="Post" 
                            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
                          {comment.post.caption?.slice(0, 100) || "Kein Caption"}
                          {(comment.post.caption?.length || 0) > 100 && "..."}
                        </p>
                      </div>
                    )}
                    
                    <div className="p-5">
                      <div className="flex items-start gap-4">
                        {/* Avatar */}
                        <div className="flex-shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        
                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Header */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-foreground">
                              @{comment.commenter_username || "Unbekannt"}
                            </span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(comment.comment_timestamp), { 
                                addSuffix: true, 
                                locale: de 
                              })}
                            </span>
                          </div>
                          
                          {/* Fan Comment */}
                          <div className="text-sm text-foreground bg-muted/40 rounded-xl p-4 mb-4 border border-border/30">
                            "{comment.comment_text}"
                          </div>
                          
                          {/* Reply Textarea */}
                          <div className="space-y-3">
                            <div className="relative">
                              <Textarea
                                placeholder={noModelSelected ? "Wähle zuerst ein KI-Modell..." : "Deine Antwort..."}
                                value={replyTexts[comment.id] || ""}
                                onChange={(e) => handleReplyTextChange(comment.id, e.target.value)}
                                disabled={noModelSelected || isAutoGenerating}
                                className={cn(
                                  "min-h-[90px] resize-none rounded-xl border-border/50 focus:border-primary/50",
                                  noModelSelected && "bg-muted/50 cursor-not-allowed"
                                )}
                              />
                              {/* Model Badge */}
                              {generatedReply && (
                                <Badge 
                                  variant="secondary" 
                                  className="absolute top-2 right-2 text-xs gap-1 rounded-lg"
                                >
                                  <Brain className="h-3 w-3" />
                                  {AI_MODELS.find(m => m.id === generatedReply.model)?.name || "KI"}
                                </Badge>
                              )}
                            </div>
                            
                            {/* Actions */}
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSendReply(comment)}
                                disabled={sendingReply === comment.id || !hasReply || noModelSelected}
                                className="gap-2 rounded-xl h-9"
                              >
                                {sendingReply === comment.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4" />
                                )}
                                Senden
                              </Button>
                              
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(comment.id)}
                                disabled={deletingComment === comment.id}
                                className="text-muted-foreground hover:text-destructive ml-auto rounded-xl h-9"
                              >
                                {deletingComment === comment.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </GlobalLayout>
  );
}
