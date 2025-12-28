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
  EyeOff,
  Ban,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const [hidingComment, setHidingComment] = useState<string | null>(null);
  const [blockingUser, setBlockingUser] = useState<string | null>(null);
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

  // Hide a comment (locally + on Instagram)
  const handleHideComment = async (commentId: string) => {
    setHidingComment(commentId);
    
    try {
      const { data, error } = await supabase.functions.invoke("moderate-comment", {
        body: { comment_id: commentId, action: "hide" },
      });
      
      if (error) throw error;
      
      // Remove from local state
      setGeneratedReplies(prev => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
      
      toast.success("Kommentar ausgeblendet");
      refetch();
    } catch (err) {
      console.error("Hide error:", err);
      toast.error("Fehler beim Ausblenden");
    } finally {
      setHidingComment(null);
    }
  };

  // Block a user (hides all their comments)
  const handleBlockUser = async (commentId: string, username: string | null) => {
    setBlockingUser(commentId);
    
    try {
      const { data, error } = await supabase.functions.invoke("moderate-comment", {
        body: { comment_id: commentId, action: "block" },
      });
      
      if (error) throw error;
      
      // Remove from local state
      setGeneratedReplies(prev => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
      
      toast.success(`@${username || "User"} blockiert`);
      refetch();
    } catch (err) {
      console.error("Block error:", err);
      toast.error("Fehler beim Blockieren");
    } finally {
      setBlockingUser(null);
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
      <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-28 sm:pb-32">
        {/* Header with Model Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              Community
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2 ml-10 sm:ml-[52px]">
              {comments.length} offene Kommentare
            </p>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3">
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
              size="sm"
              className="gap-2 rounded-xl h-9 sm:h-10"
            >
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </div>
        </div>

        {/* No Model Selected Prompt */}
        {noModelSelected && comments.length > 0 && (
          <Card className="mb-4 sm:mb-6 border-primary/50 bg-primary/5 rounded-2xl">
            <CardContent className="flex items-start sm:items-center gap-3 sm:gap-4 py-4 sm:py-5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground text-sm sm:text-base">KI-Modell auswählen</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Wähle oben ein Modell für Smart Replies.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {comments.length === 0 ? (
          <Card className="border-dashed border-2 rounded-2xl">
            <CardContent className="flex flex-col items-center justify-center py-12 sm:py-20 px-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-4 sm:mb-6">
                <MessageCircle className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
              </div>
              <h2 className="text-lg sm:text-xl font-semibold mb-2 text-center">Keine offenen Kommentare</h2>
              <p className="text-muted-foreground text-center text-sm max-w-md mb-4 sm:mb-6">
                Alle Kommentare bearbeitet oder noch keine von Instagram geladen.
              </p>
              <Button onClick={handleFetchComments} size="default" className="gap-2 rounded-xl">
                <RefreshCw className="h-4 w-4" />
                Kommentare abrufen
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
                              
                              {/* Moderation Icons */}
                              <div className="flex items-center gap-1 ml-auto">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleHideComment(comment.id)}
                                        disabled={hidingComment === comment.id}
                                        className="text-muted-foreground hover:text-amber-500 rounded-xl h-9 w-9 p-0"
                                      >
                                        {hidingComment === comment.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <EyeOff className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Kommentar ausblenden</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleBlockUser(comment.id, comment.commenter_username)}
                                        disabled={blockingUser === comment.id}
                                        className="text-muted-foreground hover:text-destructive rounded-xl h-9 w-9 p-0"
                                      >
                                        {blockingUser === comment.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Ban className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Absender blockieren</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
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
