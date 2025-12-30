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
  AlertTriangle,
  EyeOff,
  Ban,
  ExternalLink,
  X,
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
import { NegativeCommentsDialog } from "@/components/community/NegativeCommentsDialog";
import { useGenerationContext } from "@/contexts/GenerationContext";

interface Comment {
  id: string;
  comment_text: string;
  commenter_username: string | null;
  comment_timestamp: string;
  ai_reply_suggestion: string | null;
  ig_comment_id: string;
  ig_media_id: string;
  sentiment_score: number | null;
  is_critical: boolean | null;
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
          ig_media_id,
          sentiment_score,
          is_critical
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

  // Filter comments based on blacklist topics (check post caption) and separate negative comments
  const { filteredComments, negativeComments, allComments } = useMemo(() => {
    const filtered: Comment[] = [];
    const negative: Comment[] = [];
    const visible: Comment[] = [];
    
    rawComments.forEach(comment => {
      const caption = comment.post?.caption?.toLowerCase() || "";
      const isBlacklisted = blacklistTopics.some(topic => 
        caption.includes(topic.topic.toLowerCase())
      );
      
      if (isBlacklisted) {
        filtered.push(comment);
      } else {
        // Check if negative/critical - sentiment_score < 0.3 or is_critical = true
        const isNegative = comment.is_critical === true || 
          (comment.sentiment_score !== null && comment.sentiment_score < 0.3);
        
        if (isNegative) {
          negative.push(comment);
        } else {
          visible.push(comment);
        }
      }
    });
    
    return { filteredComments: filtered, negativeComments: negative, allComments: visible };
  }, [rawComments, blacklistTopics]);

  // Display only up to displayLimit comments
  const comments = useMemo(() => {
    return allComments.slice(0, displayLimit);
  }, [allComments, displayLimit]);

  // Statistics for display
  const stats = useMemo(() => {
    const total = allComments.length + negativeComments.length;
    const withReply = allComments.filter(c => c.ai_reply_suggestion).length + 
                      negativeComments.filter(c => c.ai_reply_suggestion).length;
    const withoutReply = total - withReply;
    const negativeCount = negativeComments.length;
    return { total, withReply, withoutReply, negativeCount };
  }, [allComments, negativeComments]);

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
          let status: "pending" | "waiting_for_post" = "waiting_for_post";

          if (nextPost?.scheduled_at) {
            const postTime = new Date(nextPost.scheduled_at);
            const currentIndex = (existingCount || 0) + i;
            const isEven = currentIndex % 2 === 0;
            const targetTime = isEven 
              ? subMinutes(postTime, 15 + Math.floor(i / 2) * 5) 
              : addMinutes(postTime, 15 + Math.floor(i / 2) * 5);
            scheduledFor = targetTime.toISOString();
            status = "pending";
          }

          // Add to reply queue
          const { error: queueError } = await supabase
            .from("comment_reply_queue")
            .insert({
              user_id: user.user.id,
              ig_comment_id: comment.ig_comment_id,
              comment_id: comment.id,
              reply_text: replyText,
              status,
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
      // If no post scheduled, use waiting_for_post status (trigger will activate on post schedule)
      const status = scheduledFor ? "pending" : "waiting_for_post";
      const { error: queueError } = await supabase
        .from("comment_reply_queue")
        .insert({
          user_id: user.user.id,
          ig_comment_id: comment.ig_comment_id,
          comment_id: comment.id,
          reply_text: replyText,
          status,
          scheduled_for: scheduledFor,
        });
      
      if (queueError) throw queueError;
      
      // Mark comment as replied
      await supabase
        .from("instagram_comments")
        .update({ is_replied: true, ai_reply_suggestion: replyText })
        .eq("id", comment.id);
      
      toast.success(scheduledFor 
        ? `✅ Geplant für ${schedulingInfo}` 
        : `⏳ Wartet auf nächsten Post`);
      
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
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto pb-40">
        {/* Clean Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Community</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {comments.length} Kommentare warten auf Antwort
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <ReplyQueueIndicator onQueueChange={() => refetch()} />
            <Button
              onClick={handleFetchComments}
              disabled={isRefetching}
              variant="outline"
              size="sm"
              className="gap-2 rounded-2xl"
            >
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
          </div>
        </div>

        {/* Compact Action Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-2xl bg-card border border-border/30">
          <AiModelSelector
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            disabled={isGenerating}
            isGenerating={isGenerating}
            generationProgress={progress}
          />
          {commentsWithReplies.length > 0 && !isGenerating && (
            <Button onClick={handleSendAllReplies} disabled={isSendingAll} size="sm" className="gap-2 rounded-2xl ml-auto">
              {isSendingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {commentsWithReplies.length} senden
            </Button>
          )}
        </div>

        {/* Generation Progress - Inline */}
        {isGenerating && progress && (
          <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <Brain className="h-5 w-5 text-primary animate-pulse" />
                <span className="text-sm font-medium">{progress.current} / {progress.total} generiert</span>
              </div>
              <Button onClick={cancelGeneration} variant="ghost" size="sm" className="gap-2">
                <X className="h-4 w-4" /> Abbrechen
              </Button>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Quick Stats & Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
          <span className="text-muted-foreground">{stats.total} gesamt</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-primary font-medium">{stats.withReply} mit Antwort</span>
          {negativeComments.length > 0 && (
            <NegativeCommentsDialog
              negativeComments={negativeComments}
              triggerText={`${negativeComments.length} negativ`}
              replyTexts={replyTexts}
              onReplyTextChange={handleReplyTextChange}
              onSendReply={handleSendReply}
              onHideComment={(comment) => handleHideComment(comment.id)}
              onBlockUser={(comment) => handleBlockUser(comment.id, comment.commenter_username)}
              sendingReply={sendingReply}
              hidingComment={hidingComment}
              blockingUser={blockingUser}
            />
          )}
          {filteredComments.length > 0 && (
            <FilteredCommentsDialog
              filteredComments={filteredComments}
              blacklistTopics={blacklistTopics}
              onRemoveBlacklistTopic={handleRemoveBlacklistTopic}
              triggerText={`${filteredComments.length} gefiltert`}
            />
          )}
        </div>

        {/* Empty State */}
        {comments.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Keine offenen Kommentare</h2>
            <p className="text-muted-foreground text-sm mb-6">Alle bearbeitet oder noch keine geladen.</p>
            <Button onClick={handleFetchComments} variant="outline" className="gap-2 rounded-2xl">
              <RefreshCw className="h-4 w-4" /> Kommentare laden
            </Button>
          </div>
        ) : (
          /* Posts Feed - Like reference design */
          <div className="space-y-4">
            {commentsByPost.map((group, groupIndex) => {
              const { post, comments: groupComments } = group;
              const isOdd = groupIndex % 2 === 1;

              return (
                <div 
                  key={group.igMediaId} 
                  className={cn(
                    "rounded-3xl p-5 transition-all",
                    isOdd ? "bg-amber-50/50 dark:bg-amber-950/10" : "bg-blue-50/50 dark:bg-blue-950/10"
                  )}
                >
                  {/* Post Header with Avatar */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {post?.original_media_url ? (
                        <img src={post.original_media_url} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow-sm" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-muted flex items-center justify-center ring-2 ring-white">
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-foreground text-sm">Post</p>
                        <p className="text-xs text-muted-foreground">
                          {groupComments.length} Kommentar{groupComments.length !== 1 ? "e" : ""}
                        </p>
                      </div>
                    </div>
                    {post?.original_ig_permalink && (
                      <a href={post.original_ig_permalink} target="_blank" rel="noopener noreferrer"
                        className="p-2 rounded-full hover:bg-white/50 transition-colors">
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    )}
                  </div>

                  {/* Caption */}
                  {post?.caption && (
                    <p className="text-sm text-foreground mb-4 line-clamp-3">{post.caption}</p>
                  )}

                  {/* Post Image */}
                  {post?.original_media_url && (
                    <div className="mb-4 rounded-2xl overflow-hidden">
                      <img src={post.original_media_url} alt="Post" className="w-full max-h-64 object-cover" />
                    </div>
                  )}

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
                </div>
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
