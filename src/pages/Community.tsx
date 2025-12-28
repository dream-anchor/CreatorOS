import { useState, useEffect, useCallback, useMemo } from "react";
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
  ExternalLink,
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
import { RulesConfigPanel } from "@/components/community/RulesConfigPanel";
import { ReplyQueueIndicator } from "@/components/community/ReplyQueueIndicator";
import { FilteredCommentsDialog } from "@/components/community/FilteredCommentsDialog";
import { useGenerationContext } from "@/contexts/GenerationContext";

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
    original_ig_permalink: string | null;
    published_at: string | null;
  } | null;
}

interface GeneratedReply {
  text: string;
  model: string;
}

interface EmojiNogoTerm {
  id: string;
  term: string;
}

interface BlacklistTopic {
  id: string;
  topic: string;
}

export default function Community() {
  const queryClient = useQueryClient();
  const { isGenerating, progress, startGeneration, cancelGeneration } = useGenerationContext();
  
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelForReplies, setModelForReplies] = useState<string | null>(null);
  const [generatedReplies, setGeneratedReplies] = useState<Record<string, GeneratedReply>>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);
  const [deletingComment, setDeletingComment] = useState<string | null>(null);
  const [hidingComment, setHidingComment] = useState<string | null>(null);
  const [blockingUser, setBlockingUser] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});

  // Fetch emoji nogo terms
  const { data: emojiNogoTerms = [], refetch: refetchEmoji } = useQuery({
    queryKey: ['emoji-nogo-terms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emoji_nogo_terms")
        .select("id, term")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EmojiNogoTerm[];
    },
  });

  // Fetch blacklist topics
  const { data: blacklistTopics = [], refetch: refetchBlacklist } = useQuery({
    queryKey: ['blacklist-topics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blacklist_topics")
        .select("id, topic")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BlacklistTopic[];
    },
  });

  // State for display limit
  const [displayLimit, setDisplayLimit] = useState(50);

  // Fetch comments - no hard limit, we control display via state
  const { data: rawComments = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['community-comments'],
    queryFn: async () => {
      // First fetch comments - get all unreplied comments
      const { data: commentsData, error: commentsError } = await supabase
        .from("instagram_comments")
        .select(`
          id, 
          comment_text, 
          commenter_username, 
          comment_timestamp, 
          ai_reply_suggestion, 
          ig_comment_id, 
          ig_media_id
        `)
        .eq("is_replied", false)
        .eq("is_hidden", false)
        .order("comment_timestamp", { ascending: false });
      
      if (commentsError) throw commentsError;
      
      // Get unique ig_media_ids
      const igMediaIds = [...new Set(commentsData.map(c => c.ig_media_id).filter(Boolean))];
      
      // Fetch posts by ig_media_id
      let postsMap: Record<string, { id: string; caption: string | null; original_media_url: string | null; original_ig_permalink: string | null; published_at: string | null }> = {};
      
      if (igMediaIds.length > 0) {
        const { data: postsData, error: postsError } = await supabase
          .from("posts")
          .select("id, caption, original_media_url, original_ig_permalink, ig_media_id, published_at")
          .in("ig_media_id", igMediaIds);
        
        if (!postsError && postsData) {
          postsData.forEach(post => {
            if (post.ig_media_id) {
              postsMap[post.ig_media_id] = {
                id: post.id,
                caption: post.caption,
                original_media_url: post.original_media_url,
                original_ig_permalink: post.original_ig_permalink,
                published_at: post.published_at,
              };
            }
          });
        }
      }
      
      // Merge posts into comments
      return commentsData.map(comment => ({
        ...comment,
        post: postsMap[comment.ig_media_id] || null,
      })) as Comment[];
    },
    staleTime: 30000,
  });

  // Filter comments based on blacklist topics (check post caption)
  const { filteredComments, allComments } = useMemo(() => {
    if (blacklistTopics.length === 0) {
      return { filteredComments: [], allComments: rawComments };
    }
    
    const filtered: Comment[] = [];
    const visible: Comment[] = [];
    
    rawComments.forEach(comment => {
      const caption = comment.post?.caption?.toLowerCase() || "";
      const isBlacklisted = blacklistTopics.some(topic => 
        caption.includes(topic.topic.toLowerCase())
      );
      if (isBlacklisted) {
        filtered.push(comment);
      } else {
        visible.push(comment);
      }
    });
    
    return { filteredComments: filtered, allComments: visible };
  }, [rawComments, blacklistTopics]);

  // Display only up to displayLimit comments
  const comments = useMemo(() => {
    return allComments.slice(0, displayLimit);
  }, [allComments, displayLimit]);

  // Statistics for display
  const stats = useMemo(() => {
    const total = allComments.length;
    const withReply = allComments.filter(c => c.ai_reply_suggestion).length;
    const withoutReply = total - withReply;
    return { total, withReply, withoutReply };
  }, [allComments]);

  // Group comments by post
  const commentsByPost = useMemo(() => {
    const groups: Record<string, {
      postId: string;
      igMediaId: string;
      post: Comment["post"];
      comments: Comment[];
    }> = {};

    comments.forEach(comment => {
      const key = comment.ig_media_id || "no-post";
      if (!groups[key]) {
        groups[key] = {
          postId: comment.post?.id || "",
          igMediaId: comment.ig_media_id,
          post: comment.post,
          comments: [],
        };
      }
      groups[key].comments.push(comment);
    });

    // Sort groups by most recent comment
    return Object.values(groups).sort((a, b) => {
      const aTime = Math.max(...a.comments.map(c => new Date(c.comment_timestamp).getTime()));
      const bTime = Math.max(...b.comments.map(c => new Date(c.comment_timestamp).getTime()));
      return bTime - aTime;
    });
  }, [comments]);

  // Handlers for rules config
  const handleAddEmojiNogoTerms = async (terms: string[]) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const inserts = terms.map(term => ({
        user_id: user.user!.id,
        term,
      }));

      const { error } = await supabase
        .from("emoji_nogo_terms")
        .insert(inserts);

      if (error) throw error;
      refetchEmoji();
      toast.success(`${terms.length} Begriff(e) hinzugefügt`);
    } catch (err) {
      console.error("Add emoji nogo error:", err);
      toast.error("Fehler beim Hinzufügen");
    }
  };

  const handleRemoveEmojiNogoTerm = async (id: string) => {
    try {
      const { error } = await supabase
        .from("emoji_nogo_terms")
        .delete()
        .eq("id", id);

      if (error) throw error;
      refetchEmoji();
    } catch (err) {
      console.error("Remove emoji nogo error:", err);
      toast.error("Fehler beim Entfernen");
    }
  };

  const handleAddBlacklistTopics = async (topics: string[]) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const inserts = topics.map(topic => ({
        user_id: user.user!.id,
        topic,
      }));

      const { error } = await supabase
        .from("blacklist_topics")
        .insert(inserts);

      if (error) throw error;
      refetchBlacklist();
      toast.success(`${topics.length} Thema/Themen hinzugefügt`);
    } catch (err) {
      console.error("Add blacklist topic error:", err);
      toast.error("Fehler beim Hinzufügen");
    }
  };

  const handleRemoveBlacklistTopic = async (id: string) => {
    try {
      const { error } = await supabase
        .from("blacklist_topics")
        .delete()
        .eq("id", id);

      if (error) throw error;
      refetchBlacklist();
    } catch (err) {
      console.error("Remove blacklist topic error:", err);
      toast.error("Fehler beim Entfernen");
    }
  };

  // Sync replyTexts with generatedReplies AND ai_reply_suggestion from DB
  useEffect(() => {
    const newTexts: Record<string, string> = {};
    
    // First, populate from database ai_reply_suggestion
    comments.forEach(comment => {
      if (comment.ai_reply_suggestion) {
        newTexts[comment.id] = comment.ai_reply_suggestion;
      }
    });
    
    // Then override with any locally generated replies
    Object.entries(generatedReplies).forEach(([id, reply]) => {
      newTexts[id] = reply.text;
    });
    
    setReplyTexts(newTexts);
  }, [generatedReplies, comments]);

  // Listen for refresh events from the chat
  useEffect(() => {
    const handleRefresh = () => {
      queryClient.invalidateQueries({ queryKey: ['community-comments'] });
    };
    
    window.addEventListener('refresh-comments', handleRefresh);
    return () => window.removeEventListener('refresh-comments', handleRefresh);
  }, [queryClient]);

  // Auto-generate replies using the global context (runs in background)
  const handleGenerateAllReplies = useCallback((model: string) => {
    // Get all comments WITHOUT ai_reply_suggestion from allComments
    const commentsToGenerate = allComments.filter(c => !c.ai_reply_suggestion);
    
    if (commentsToGenerate.length === 0) {
      toast.info("Alle Kommentare haben bereits Antworten");
      return;
    }

    const commentIds = commentsToGenerate.map(c => c.id);
    
    // Start generation in global context (will continue if user navigates away)
    startGeneration(commentIds, model, () => {
      // This callback is called after each batch completes
      refetch();
    });
    
    setModelForReplies(model);
  }, [allComments, startGeneration, refetch]);

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

  // Count how many comments have replies ready
  const commentsWithReplies = useMemo(() => {
    return comments.filter(c => replyTexts[c.id]?.trim());
  }, [comments, replyTexts]);

  // State for batch sending
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number } | null>(null);

  // Send all replies at once
  const handleSendAllReplies = async () => {
    const toSend = commentsWithReplies;
    if (toSend.length === 0) {
      toast.error("Keine Antworten zum Senden vorhanden!");
      return;
    }

    setIsSendingAll(true);
    setSendProgress({ current: 0, total: toSend.length });

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

      // Get existing pending count for alternating
      const { count: existingCount } = await supabase
        .from("comment_reply_queue")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.user.id)
        .eq("status", "pending");

      let sentCount = 0;
      let errorCount = 0;

      for (let i = 0; i < toSend.length; i++) {
        const comment = toSend[i];
        const replyText = replyTexts[comment.id]?.trim();
        
        if (!replyText) continue;

        setSendProgress({ current: i + 1, total: toSend.length });

        try {
          let scheduledFor: string | null = null;

          if (nextPost?.scheduled_at) {
            const postTime = new Date(nextPost.scheduled_at);
            const currentIndex = (existingCount || 0) + i;
            const isEven = currentIndex % 2 === 0;
            const targetTime = isEven 
              ? subMinutes(postTime, 15 + Math.floor(i / 2) * 5) 
              : addMinutes(postTime, 15 + Math.floor(i / 2) * 5);
            scheduledFor = targetTime.toISOString();
          }

          // Add to reply queue
          const { error: queueError } = await supabase
            .from("comment_reply_queue")
            .insert({
              user_id: user.user.id,
              ig_comment_id: comment.ig_comment_id,
              comment_id: comment.id,
              reply_text: replyText,
              status: "pending",
              scheduled_for: scheduledFor,
            });

          if (queueError) throw queueError;

          // Mark comment as replied
          await supabase
            .from("instagram_comments")
            .update({ is_replied: true, ai_reply_suggestion: replyText })
            .eq("id", comment.id);

          sentCount++;
        } catch (err) {
          console.error(`Error sending reply for ${comment.id}:`, err);
          errorCount++;
        }
      }

      // Clear local state
      setGeneratedReplies({});
      setReplyTexts({});
      
      if (errorCount === 0) {
        toast.success(`✅ ${sentCount} Antworten in die Queue eingereiht!`);
      } else {
        toast.warning(`${sentCount} gesendet, ${errorCount} Fehler`);
      }
      
      refetch();
    } catch (err) {
      console.error("Send all error:", err);
      toast.error("Fehler beim Senden");
    } finally {
      setIsSendingAll(false);
      setSendProgress(null);
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
      <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-40">
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
            <ReplyQueueIndicator onQueueChange={() => refetch()} />
            <AiModelSelector
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              disabled={isGenerating}
              isGenerating={isGenerating}
              generationProgress={progress}
            />
            {/* Generate button - shows when model selected but no replies generated yet */}
            {selectedModel && Object.keys(generatedReplies).length === 0 && comments.length > 0 && !isGenerating && (
              <Button
                onClick={() => handleGenerateAllReplies(selectedModel)}
                size="sm"
                className="gap-2 rounded-xl h-9 sm:h-10"
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden sm:inline">Generieren</span>
              </Button>
            )}
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

        {/* Generation Progress Bar - Shows during generation */}
        {isGenerating && progress && (
          <Card className="mb-4 sm:mb-6 border-primary/50 bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl overflow-hidden">
            <CardContent className="py-4 sm:py-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Brain className="h-5 w-5 sm:h-6 sm:w-6 text-primary animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm sm:text-base">
                      Generiere Antworten...
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {progress.current} von {progress.total} verarbeitet
                    </p>
                  </div>
                </div>
                <Button
                  onClick={cancelGeneration}
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-xl"
                >
                  <Ban className="h-4 w-4" />
                  Abbrechen
                </Button>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-primary to-accent h-full rounded-full transition-all duration-300"
                  style={{ 
                    width: `${(progress.current / progress.total) * 100}%` 
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {Math.round((progress.current / progress.total) * 100)}% — 
                Batch {Math.ceil(progress.current / 10)} von {Math.ceil(progress.total / 10)}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Send All Button - Shows when there are replies ready */}
        {commentsWithReplies.length > 0 && !isGenerating && (
          <Card className="mb-4 sm:mb-6 border-primary/50 bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl">
            <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 sm:py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Send className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm sm:text-base">
                    {commentsWithReplies.length} Antwort{commentsWithReplies.length !== 1 ? "en" : ""} bereit
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {isSendingAll && sendProgress 
                      ? `Sende ${sendProgress.current}/${sendProgress.total}...`
                      : "Alle Antworten werden optimal getimed"}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleSendAllReplies}
                disabled={isSendingAll}
                size="lg"
                className="gap-2 rounded-xl w-full sm:w-auto"
              >
                {isSendingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sende...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Alle {commentsWithReplies.length} senden
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

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

        {/* Rules Config Panel */}
        <div className="mb-4 sm:mb-6">
          <RulesConfigPanel
            emojiNogoTerms={emojiNogoTerms}
            blacklistTopics={blacklistTopics}
            onAddEmojiNogoTerms={handleAddEmojiNogoTerms}
            onRemoveEmojiNogoTerm={handleRemoveEmojiNogoTerm}
            onAddBlacklistTopics={handleAddBlacklistTopics}
            onRemoveBlacklistTopic={handleRemoveBlacklistTopic}
          />
        </div>

        {/* Statistics Card */}
        <Card className="mb-4 sm:mb-6 rounded-2xl border-border/50 bg-muted/30">
          <CardContent className="py-4 px-5">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Gesamt:</span>
                <span className="font-semibold text-foreground">{stats.total}</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Mit KI-Antwort:</span>
                <span className="font-semibold text-primary">{stats.withReply}</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-muted-foreground">Ohne Antwort:</span>
                <span className="font-semibold text-amber-500">{stats.withoutReply}</span>
              </div>
              {allComments.length > displayLimit && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>•</span>
                  <span>Zeige {displayLimit} von {allComments.length}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Filtered count info - clickable dialog */}
        {filteredComments.length > 0 && (
          <div className="mb-4">
            <FilteredCommentsDialog
              filteredComments={filteredComments}
              blacklistTopics={blacklistTopics}
              onRemoveBlacklistTopic={handleRemoveBlacklistTopic}
              triggerText={`${filteredComments.length} Kommentar(e) durch Themen-Filter ausgeblendet`}
            />
          </div>
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
          /* Comments grouped by Post */
          <div className="space-y-6">
            {commentsByPost.map((group) => {
              const { post, comments: groupComments } = group;
              const caption = post?.caption || "";
              const isLongCaption = caption.length > 300;

              return (
                <Card 
                  key={group.igMediaId} 
                  className="overflow-hidden rounded-2xl border-border/50"
                >
                  {/* Post Header - Full Context */}
                  <div className="bg-muted/30 border-b border-border/30">
                    <div className="flex gap-4 p-5">
                      {/* Post Image */}
                      <div className="flex-shrink-0">
                        {post?.original_media_url ? (
                          <img
                            src={post.original_media_url}
                            alt="Post"
                            className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = "/placeholder.svg";
                            }}
                          />
                        ) : (
                          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-xl bg-muted flex items-center justify-center">
                            <ImageIcon className="h-10 w-10 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Post Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <Badge variant="secondary" className="gap-1.5 rounded-lg">
                            <MessageCircle className="h-3 w-3" />
                            {groupComments.length} Kommentar{groupComments.length !== 1 ? "e" : ""}
                          </Badge>
                          
                          {post?.original_ig_permalink && (
                            <a
                              href={post.original_ig_permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span className="hidden sm:inline">Auf Instagram öffnen</span>
                            </a>
                          )}
                        </div>

                        {/* Caption */}
                        <div className="text-sm text-foreground">
                          {isLongCaption ? (
                            <details className="group">
                              <summary className="cursor-pointer list-none">
                                <span className="whitespace-pre-wrap">{caption.slice(0, 300)}...</span>
                                <span className="text-primary hover:underline text-xs ml-1 group-open:hidden">
                                  Mehr anzeigen
                                </span>
                              </summary>
                              <span className="whitespace-pre-wrap">{caption.slice(300)}</span>
                              <span className="text-primary hover:underline text-xs ml-1 block mt-1">
                                Weniger anzeigen
                              </span>
                            </details>
                          ) : (
                            <p className="whitespace-pre-wrap">{caption || "Kein Caption"}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Comments List */}
                  <div className="divide-y divide-border/30">
                    {groupComments.map((comment) => {
                      const generatedReply = generatedReplies[comment.id];
                      const hasReply = !!replyTexts[comment.id]?.trim();

                      return (
                        <div key={comment.id} className="p-5">
                          <div className="flex items-start gap-4">
                            {/* Avatar */}
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              {/* Header */}
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-semibold text-foreground text-sm">
                                  @{comment.commenter_username || "Unbekannt"}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(new Date(comment.comment_timestamp), {
                                    addSuffix: true,
                                    locale: de,
                                  })}
                                </span>
                              </div>

                              {/* Fan Comment */}
                              <div className="text-sm text-foreground bg-muted/40 rounded-xl p-3 mb-3 border border-border/30">
                                "{comment.comment_text}"
                              </div>

                              {/* AI Reply Section - PROMINENT */}
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-1">
                                  <Sparkles className="h-4 w-4 text-primary" />
                                  <span className="text-sm font-medium text-foreground">Deine Antwort</span>
                                  {(generatedReply || comment.ai_reply_suggestion) && (
                                    <Badge variant="secondary" className="text-xs gap-1 rounded-lg">
                                      <Brain className="h-3 w-3" />
                                      {generatedReply 
                                        ? AI_MODELS.find((m) => m.id === generatedReply.model)?.name || "KI"
                                        : "KI-generiert"
                                      }
                                    </Badge>
                                  )}
                                </div>
                                <div className="relative">
                                  <Textarea
                                    placeholder="Antwort eingeben oder per KI generieren lassen..."
                                    value={replyTexts[comment.id] || ""}
                                    onChange={(e) => handleReplyTextChange(comment.id, e.target.value)}
                                    disabled={isGenerating}
                                    className={cn(
                                      "min-h-[100px] resize-none rounded-xl text-sm",
                                      hasReply 
                                        ? "border-primary/50 bg-primary/5 focus:border-primary focus:bg-primary/10" 
                                        : "border-border/50 focus:border-primary/50"
                                    )}
                                  />
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleSendReply(comment)}
                                    disabled={sendingReply === comment.id || !hasReply}
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
                                            className="text-muted-foreground hover:text-amber-500 rounded-xl h-8 w-8 p-0"
                                          >
                                            {hidingComment === comment.id ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <EyeOff className="h-3 w-3" />
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
                                            onClick={() =>
                                              handleBlockUser(comment.id, comment.commenter_username)
                                            }
                                            disabled={blockingUser === comment.id}
                                            className="text-muted-foreground hover:text-destructive rounded-xl h-8 w-8 p-0"
                                          >
                                            {blockingUser === comment.id ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <Ban className="h-3 w-3" />
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
                      );
                    })}
                  </div>
                </Card>
              );
            })}

            {/* Load More Button */}
            {allComments.length > displayLimit && (
              <div className="mt-6 text-center">
                <Button
                  variant="outline"
                  onClick={() => setDisplayLimit(prev => prev + 50)}
                  className="gap-2 rounded-xl"
                >
                  <RefreshCw className="h-4 w-4" />
                  Weitere {Math.min(50, allComments.length - displayLimit)} laden
                  <Badge variant="secondary" className="ml-1">
                    {allComments.length - displayLimit} übrig
                  </Badge>
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </GlobalLayout>
  );
}
