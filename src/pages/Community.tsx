import { useState, useEffect, useCallback, useMemo } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, PanInfo } from "framer-motion";
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
  Play,
  ArrowRight,
  SkipForward,
  Check,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Settings,
  Sparkles,
  ShieldCheck
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

  // Focus Mode State
  const [focusIndex, setFocusIndex] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);
  const [showRefineDialog, setShowRefineDialog] = useState(false);
  const [refineReason, setRefineReason] = useState<string>("");
  const [refineCustomNote, setRefineCustomNote] = useState("");

  const [showSettings, setShowSettings] = useState(false);

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

  const handleFocusNext = () => {
    setSwipeDirection(null);
    if (focusIndex < comments.length - 1) {
      setFocusIndex(prev => prev + 1);
    } else {
      setIsFocusMode(false); // Exit focus mode if done
      toast.success("Alle Kommentare bearbeitet! 🎉");
    }
  };

  const handleSwipe = async (event: any, info: PanInfo) => {
    const threshold = 100;
    if (info.offset.x > threshold) {
      // Right Swipe (Approve)
      setSwipeDirection("right");
      const comment = comments[focusIndex];
      const replyText = replyTexts[comment.id];
      if (replyText?.trim()) {
        await handleSendReply(comment);
        setTimeout(handleFocusNext, 200);
      } else {
        toast.error("Keine Antwort zum Senden!");
        setSwipeDirection(null);
      }
    } else if (info.offset.x < -threshold) {
      // Left Swipe (Refine/Reject)
      setSwipeDirection("left");
      setShowRefineDialog(true);
    }
  };

  const handleRefineSubmit = async () => {
    const comment = comments[focusIndex];
    const betterReply = replyTexts[comment.id];
    const originalAiReply = comment.ai_reply_suggestion;

    if (!betterReply?.trim()) {
      toast.error("Bitte gib eine korrigierte Antwort ein.");
      return;
    }

    try {
      const { data: user } = await supabase.auth.getUser();
      if (user.user) {
        // Save training data
        await supabase.from("reply_training_data" as any).insert({
          user_id: user.user.id,
          comment_text: comment.comment_text,
          original_ai_reply: originalAiReply,
          better_reply: betterReply,
          correction_reason: refineReason || "custom",
          correction_note: refineCustomNote
        });
        
        toast.success("Feedback gespeichert & System trainiert 🧠");
      }
      
      // Send the corrected reply
      await handleSendReply(comment);
      
      // Reset & Next
      setShowRefineDialog(false);
      setRefineReason("");
      setRefineCustomNote("");
      handleFocusNext();
    } catch (error) {
      console.error("Training error:", error);
      toast.error("Fehler beim Speichern des Feedbacks");
    }
  };

  const handleFocusSend = async (comment: Comment) => {
    await handleSendReply(comment);
    handleFocusNext();
  };

  const handleFocusSkip = () => {
    handleFocusNext();
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

  return (
    <GlobalLayout>
      <div className="flex flex-col h-[calc(100vh-6rem)] overflow-hidden relative">
        {/* Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Community Einstellungen
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              {/* AI Model Selection */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                  <Brain className="h-4 w-4" /> KI-Modell
                </h3>
                <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                  <AiModelSelector
                    selectedModel={selectedModel}
                    onModelChange={handleModelChange}
                    disabled={isGenerating}
                    isGenerating={isGenerating}
                    generationProgress={progress}
                  />
                </div>
              </div>

              {/* Rules Configuration */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                  <ShieldCheck className="h-4 w-4" /> Moderations-Regeln
                </h3>
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
            </div>
          </DialogContent>
        </Dialog>

        {/* Minimal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-sm z-10 border-b border-border/20">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">Inbox</h1>
            {comments.length > 0 ? (
              <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-2.5 py-0.5 rounded-full">
                {comments.length} offen
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Alles erledigt
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <ReplyQueueIndicator onQueueChange={() => refetch()} />
            
            {/* Auto-Generate Button */}
            <Button 
              onClick={() => handleGenerateAllReplies(selectedModel || 'gpt-4o')} 
              disabled={isGenerating || comments.length === 0}
              variant="outline" 
              size="sm" 
              className="h-9 gap-2 hidden sm:flex"
            >
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              KI-Antworten
            </Button>

            <div className="h-6 w-px bg-border/30 mx-1" />

            <Button onClick={() => setShowSettings(true)} variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-muted">
              <Settings className="h-4 w-4 text-muted-foreground" />
            </Button>
            
            <Button onClick={handleFetchComments} disabled={isRefetching} variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-muted">
              <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isRefetching && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Main Content Area - Card Stack */}
        <div className="flex-1 flex items-center justify-center p-4 relative">
          <AnimatePresence mode="wait">
            {comments.length === 0 ? (
              /* "All Caught Up" State */
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="text-center space-y-6 max-w-md"
              >
                <div className="w-24 h-24 bg-gradient-to-br from-primary/20 to-green-500/20 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-primary/5 ring-1 ring-white/20">
                  <Check className="h-10 w-10 text-primary" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-foreground">Alles erledigt!</h2>
                  <p className="text-muted-foreground text-lg">
                    Deine Community ist glücklich. <br/>Gönn dir eine Pause. ☕️
                  </p>
                </div>
                <Button onClick={handleFetchComments} variant="outline" className="mt-8 rounded-full px-8 border-primary/20 hover:bg-primary/5 hover:text-primary transition-all">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Neu laden
                </Button>
              </motion.div>
            ) : (
              /* The Card Stack */
              <div className="w-full max-w-xl h-full max-h-[700px] relative flex flex-col">
                {/* Swipe Indicators - Absolute Positioned */}
                <AnimatePresence>
                  {swipeDirection === "right" && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.5, x: 50 }} 
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute top-10 right-10 z-50 bg-green-500 text-white p-4 rounded-full shadow-2xl rotate-12 border-4 border-white/20"
                    >
                      <ThumbsUp className="h-10 w-10 fill-current" />
                    </motion.div>
                  )}
                  {swipeDirection === "left" && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.5, x: -50 }} 
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute top-10 left-10 z-50 bg-red-500 text-white p-4 rounded-full shadow-2xl -rotate-12 border-4 border-white/20"
                    >
                      <Edit3 className="h-10 w-10 fill-current" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* The Active Card */}
                <motion.div 
                  key={comments[focusIndex].id}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.6}
                  onDragEnd={handleSwipe}
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0, x: 0 }}
                  exit={{ 
                    x: swipeDirection === "right" ? 500 : swipeDirection === "left" ? -500 : 0, 
                    opacity: 0,
                    rotate: swipeDirection === "right" ? 10 : swipeDirection === "left" ? -10 : 0,
                    transition: { duration: 0.2 }
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="bg-card border border-border/50 rounded-[2rem] shadow-2xl flex-1 flex flex-col overflow-hidden relative z-20"
                >
                  {/* Context Header (The Post) */}
                  {comments[focusIndex].post && (
                    <div className="bg-muted/30 p-4 border-b border-border/30 flex items-center gap-4 shrink-0">
                      <PostThumbnail 
                        mediaUrl={comments[focusIndex].post?.original_media_url}
                        permalink={comments[focusIndex].post?.original_ig_permalink}
                        className="w-10 h-10 rounded-xl shadow-sm ring-1 ring-black/5"
                      />
                      <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-0.5">
                           <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-background/50 px-1.5 py-0.5 rounded-md">Kontext</span>
                           <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(comments[focusIndex].post.published_at || new Date()), { addSuffix: true, locale: de })}</span>
                         </div>
                         <p className="text-xs text-foreground/70 line-clamp-1">{comments[focusIndex].post?.caption}</p>
                      </div>
                    </div>
                  )}

                  {/* Scrollable Content Area */}
                  <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 scrollbar-hide">
                    {/* The User Comment */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/10 to-blue-500/10 flex items-center justify-center ring-2 ring-background shadow-sm">
                          <User className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-bold text-lg leading-none">@{comments[focusIndex].commenter_username}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(comments[focusIndex].comment_timestamp), { addSuffix: true, locale: de })}
                          </p>
                        </div>
                      </div>
                      <div className="relative">
                        <div className="absolute -left-4 top-0 bottom-0 w-1 bg-primary/20 rounded-full" />
                        <p className="text-xl sm:text-2xl font-medium leading-relaxed text-foreground pl-2">
                          "{comments[focusIndex].comment_text}"
                        </p>
                      </div>
                    </div>

                    {/* The Reply Area */}
                    <div className="space-y-3 pt-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Deine Antwort
                        </label>
                        {comments[focusIndex].ai_reply_suggestion && (
                          <Badge variant="secondary" className="bg-primary/5 text-primary text-[10px] gap-1 hover:bg-primary/10">
                            <Brain className="h-3 w-3" /> KI-Vorschlag
                          </Badge>
                        )}
                      </div>
                      
                      <div className="relative group">
                        <Textarea
                          value={replyTexts[comments[focusIndex].id] || ""}
                          onChange={(e) => handleReplyTextChange(comments[focusIndex].id, e.target.value)}
                          placeholder="Tippe eine Antwort..."
                          className="min-h-[140px] text-lg p-5 rounded-2xl bg-muted/30 border-2 border-transparent focus:border-primary/20 focus:bg-background transition-all resize-none shadow-inner"
                          onKeyDown={(e) => e.stopPropagation()} // Prevent drag
                        />
                        {/* Quick Action Hint */}
                        {!replyTexts[comments[focusIndex].id] && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                            <span className="text-sm">✨ KI generiert Vorschläge...</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fixed Bottom Action Bar */}
                  <div className="p-4 sm:p-6 border-t border-border/30 bg-background/50 backdrop-blur-md">
                    <div className="grid grid-cols-2 gap-4">
                      <Button 
                        variant="outline" 
                        size="lg" 
                        className="h-14 rounded-2xl border-2 border-muted hover:border-red-500/30 hover:bg-red-500/5 hover:text-red-600 transition-all text-base font-medium group"
                        onClick={() => { setSwipeDirection("left"); setShowRefineDialog(true); }}
                      >
                        <Edit3 className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" />
                        Korrektur
                      </Button>

                      <Button 
                        size="lg" 
                        className="h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg hover:shadow-primary/25 hover:translate-y-[-2px] transition-all text-base font-medium"
                        onClick={() => { setSwipeDirection("right"); handleSwipe(null, { offset: { x: 200, y: 0 } } as any); }}
                        disabled={!replyTexts[comments[focusIndex].id]?.trim()}
                      >
                        <Send className="h-5 w-5 mr-2" />
                        Senden
                      </Button>
                    </div>
                    <div className="mt-4 flex justify-center gap-2">
                       <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                       <div className="h-1.5 w-1.5 rounded-full bg-border" />
                       <div className="h-1.5 w-1.5 rounded-full bg-border" />
                    </div>
                  </div>
                </motion.div>

                {/* Stack Effect Cards (Background) */}
                {focusIndex < comments.length - 1 && (
                  <div className="absolute top-4 left-4 right-4 bottom-[-10px] bg-card border border-border/30 rounded-[2rem] shadow-xl z-10 scale-[0.95] opacity-60 pointer-events-none" />
                )}
                {focusIndex < comments.length - 2 && (
                  <div className="absolute top-8 left-8 right-8 bottom-[-20px] bg-card border border-border/30 rounded-[2rem] shadow-lg z-0 scale-[0.9] opacity-30 pointer-events-none" />
                )}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Refine Dialog Overlay (Keep existing logic, update style) */}
        <AnimatePresence>
          {showRefineDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] bg-background/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-md bg-card border border-border/50 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Brain className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold">Training & Korrektur</h3>
                  <p className="text-muted-foreground text-sm">
                    Warum passte die Antwort nicht? Dein Feedback macht die KI schlauer.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: "too_formal", label: "Zu förmlich" },
                    { id: "too_casual", label: "Zu locker" },
                    { id: "too_long", label: "Zu lang" },
                    { id: "wrong_info", label: "Falsche Info" },
                    { id: "wrong_tone", label: "Falscher Ton" },
                    { id: "missed_point", label: "Thema verfehlt" },
                  ].map((reason) => (
                    <Button
                      key={reason.id}
                      variant={refineReason === reason.id ? "default" : "outline"}
                      className={cn("h-10 rounded-xl text-xs", refineReason === reason.id ? "bg-primary text-primary-foreground" : "border-border/50 bg-muted/20")}
                      onClick={() => setRefineReason(reason.id)}
                    >
                      {reason.label}
                    </Button>
                  ))}
                </div>

                <div className="space-y-3">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Die richtige Antwort
                  </label>
                  <Textarea
                    value={replyTexts[comments[focusIndex]?.id] || ""}
                    onChange={(e) => handleReplyTextChange(comments[focusIndex].id, e.target.value)}
                    className="min-h-[100px] bg-muted/30 border-2 border-transparent focus:border-primary/20 rounded-xl resize-none"
                    placeholder="Schreibe hier, wie es sein sollte..."
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => { setShowRefineDialog(false); setSwipeDirection(null); }}
                    className="flex-1 rounded-xl h-12"
                  >
                    Abbrechen
                  </Button>
                  <Button 
                    onClick={handleRefineSubmit}
                    className="flex-[2] rounded-xl h-12 shadow-lg hover:shadow-primary/20"
                  >
                    Lernen & Senden
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlobalLayout>
  );
}
