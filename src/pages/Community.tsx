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
  Send,
  User,
  Image as ImageIcon,
  Brain,
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
import { PostThumbnail } from "@/components/community/PostThumbnail";

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
  replied_by_usernames: string[] | null;
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

interface AnsweredByIgnoreAccount {
  id: string;
  username: string;
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

  // Fetch answered_by_ignore_accounts
  const { data: answeredByIgnoreAccounts = [], refetch: refetchIgnoreAccounts } = useQuery({
    queryKey: ['answered-by-ignore-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("answered_by_ignore_accounts")
        .select("id, username")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AnsweredByIgnoreAccount[];
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
          is_critical,
          replied_by_usernames
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

  // Filter comments based on blacklist topics (check post caption), answered_by and separate negative comments
  const { filteredComments, negativeComments, answeredByIgnoredComments, allComments } = useMemo(() => {
    const filtered: Comment[] = [];
    const negative: Comment[] = [];
    const answeredByIgnored: Comment[] = [];
    const visible: Comment[] = [];
    
    // Create a set of ignored usernames (lowercase for case-insensitive comparison)
    const ignoredUsernames = new Set(
      answeredByIgnoreAccounts.map(a => a.username.toLowerCase())
    );
    
    rawComments.forEach(comment => {
      const caption = comment.post?.caption?.toLowerCase() || "";
      const isBlacklisted = blacklistTopics.some(topic => 
        caption.includes(topic.topic.toLowerCase())
      );
      
      // Check if already answered by an ignored account
      const hasBeenAnsweredByIgnored = comment.replied_by_usernames?.some(
        username => ignoredUsernames.has(username.toLowerCase())
      ) || false;
      
      if (hasBeenAnsweredByIgnored) {
        answeredByIgnored.push(comment);
      } else if (isBlacklisted) {
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
    
    return { filteredComments: filtered, negativeComments: negative, answeredByIgnoredComments: answeredByIgnored, allComments: visible };
  }, [rawComments, blacklistTopics, answeredByIgnoreAccounts]);

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
    const answeredByIgnoredCount = answeredByIgnoredComments.length;
    return { total, withReply, withoutReply, negativeCount, answeredByIgnoredCount };
  }, [allComments, negativeComments, answeredByIgnoredComments]);

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

  // Handlers for answered_by_ignore_accounts
  const handleAddAnsweredByIgnoreAccounts = async (usernames: string[]) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const inserts = usernames.map(username => ({
        user_id: user.user!.id,
        username: username.toLowerCase(),
      }));

      const { error } = await supabase
        .from("answered_by_ignore_accounts")
        .insert(inserts);

      if (error) throw error;
      refetchIgnoreAccounts();
      toast.success(`${usernames.length} Account(s) hinzugefügt`);
    } catch (err) {
      console.error("Add ignore account error:", err);
      toast.error("Fehler beim Hinzufügen");
    }
  };

  const handleRemoveAnsweredByIgnoreAccount = async (id: string) => {
    try {
      const { error } = await supabase
        .from("answered_by_ignore_accounts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      refetchIgnoreAccounts();
    } catch (err) {
      console.error("Remove ignore account error:", err);
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
      <div className="p-3 sm:p-4 lg:p-6 max-w-3xl mx-auto pb-32">
        {/* Rules Config Panel */}
        <div className="mb-4">
          <RulesConfigPanel
            emojiNogoTerms={emojiNogoTerms}
            blacklistTopics={blacklistTopics}
            answeredByIgnoreAccounts={answeredByIgnoreAccounts}
            onAddEmojiNogoTerms={handleAddEmojiNogoTerms}
            onRemoveEmojiNogoTerm={handleRemoveEmojiNogoTerm}
            onAddBlacklistTopics={handleAddBlacklistTopics}
            onRemoveBlacklistTopic={handleRemoveBlacklistTopic}
            onAddAnsweredByIgnoreAccounts={handleAddAnsweredByIgnoreAccounts}
            onRemoveAnsweredByIgnoreAccount={handleRemoveAnsweredByIgnoreAccount}
          />
        </div>

        {/* Compact Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">Community</h1>
            <Badge variant="secondary" className="text-xs">{comments.length} offen</Badge>
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
          
          <div className="flex items-center gap-2">
            <ReplyQueueIndicator onQueueChange={() => refetch()} />
            <Button onClick={handleFetchComments} disabled={isRefetching} variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Compact Action Bar */}
        <div className="flex items-center gap-2 mb-4 p-2.5 rounded-xl bg-card/50 border border-border/20">
          <AiModelSelector
            selectedModel={selectedModel}
            onModelChange={handleModelChange}
            disabled={isGenerating}
            isGenerating={isGenerating}
            generationProgress={progress}
          />
          {isGenerating && progress && (
            <div className="flex items-center gap-2 flex-1 ml-2">
              <div className="flex-1 bg-muted rounded-full h-1 overflow-hidden">
                <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${(progress.current / progress.total) * 100}%` }} />
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{progress.current}/{progress.total}</span>
              <Button onClick={cancelGeneration} variant="ghost" size="icon" className="h-6 w-6 rounded-lg">
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          {commentsWithReplies.length > 0 && !isGenerating && (
            <Button onClick={handleSendAllReplies} disabled={isSendingAll} size="sm" className="gap-1.5 rounded-xl h-8 ml-auto">
              {isSendingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {commentsWithReplies.length} senden
            </Button>
          )}
        </div>

        {/* Empty State */}
        {comments.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <MessageCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-4">Keine offenen Kommentare</p>
            <Button onClick={handleFetchComments} variant="outline" size="sm" className="gap-2 rounded-xl">
              <RefreshCw className="h-3.5 w-3.5" /> Laden
            </Button>
          </div>
        ) : (
          /* Compact Posts Feed */
          <div className="space-y-3">
            {commentsByPost.map((group, groupIndex) => {
              const { post, comments: groupComments } = group;

              return (
                <div key={group.igMediaId} className="rounded-2xl bg-card/50 border border-border/20 overflow-hidden">
                  {/* Compact Post Header */}
                  <div className="flex items-center gap-3 p-3 bg-muted/30 border-b border-border/20">
                    <PostThumbnail 
                      mediaUrl={post?.original_media_url}
                      permalink={post?.original_ig_permalink}
                      className="w-8 h-8 rounded-lg"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {post?.caption || "Post"}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">{groupComments.length}</Badge>
                    {post?.original_ig_permalink && (
                      <a href={post.original_ig_permalink} target="_blank" rel="noopener noreferrer" className="shrink-0">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                      </a>
                    )}
                  </div>

                  {/* Compact Comments List */}
                  <div className="divide-y divide-border/15">
                    {groupComments.map((comment) => {
                      const generatedReply = generatedReplies[comment.id];
                      const hasReply = !!replyTexts[comment.id]?.trim();

                      return (
                        <div key={comment.id} className="p-3">
                          {/* Comment Header - inline */}
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center shrink-0">
                              <User className="h-3 w-3 text-primary/70" />
                            </div>
                            <span className="font-medium text-foreground text-xs">@{comment.commenter_username || "?"}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(comment.comment_timestamp), { addSuffix: true, locale: de })}
                            </span>
                          </div>

                          {/* Comment Text - compact */}
                          <p className="text-sm text-foreground/90 mb-2 pl-8">"{comment.comment_text}"</p>

                          {/* Reply Input - compact */}
                          <div className="pl-8">
                            <Textarea
                              placeholder="Antwort..."
                              value={replyTexts[comment.id] || ""}
                              onChange={(e) => handleReplyTextChange(comment.id, e.target.value)}
                              disabled={isGenerating}
                              rows={2}
                              className={cn(
                                "min-h-[60px] resize-none rounded-lg text-xs py-2",
                                hasReply ? "border-primary/40 bg-primary/5" : "border-border/30"
                              )}
                            />
                            
                            {/* Compact Actions */}
                            <div className="flex items-center gap-1.5 mt-2">
                              <Button
                                size="sm"
                                onClick={() => handleSendReply(comment)}
                                disabled={sendingReply === comment.id || !hasReply}
                                className="gap-1 rounded-lg h-7 text-xs px-2.5"
                              >
                                {sendingReply === comment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                Senden
                              </Button>
                              
                              {(generatedReply || comment.ai_reply_suggestion) && (
                                <Badge variant="outline" className="text-[10px] gap-1 h-5 px-1.5">
                                  <Brain className="h-2.5 w-2.5" /> KI
                                </Badge>
                              )}
                              
                              <div className="flex items-center gap-0.5 ml-auto">
                                <Button size="icon" variant="ghost" onClick={() => handleHideComment(comment.id)} disabled={hidingComment === comment.id} className="h-6 w-6 rounded-md text-muted-foreground hover:text-amber-500">
                                  {hidingComment === comment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => handleBlockUser(comment.id, comment.commenter_username)} disabled={blockingUser === comment.id} className="h-6 w-6 rounded-md text-muted-foreground hover:text-destructive">
                                  {blockingUser === comment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                                </Button>
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

            {/* Load More */}
            {allComments.length > displayLimit && (
              <div className="text-center pt-2">
                <Button variant="ghost" size="sm" onClick={() => setDisplayLimit(prev => prev + 50)} className="gap-1.5 rounded-lg text-xs">
                  +{Math.min(50, allComments.length - displayLimit)} mehr
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </GlobalLayout>
  );
}
