import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  MessageCircle,
  RefreshCw,
  AlertTriangle,
  EyeOff,
  Ban,
  Trash2,
} from "lucide-react";
import { format, formatDistanceToNow, addMinutes, subMinutes } from "date-fns";
import { de } from "date-fns/locale";
import { CommentWithContext } from "@/components/community/CommentCard";
import { RulesConfigPanel } from "@/components/community/RulesConfigPanel";
import { PostCard } from "@/components/community/PostCard";
import { ActionBar } from "@/components/community/ActionBar";
import { AiModelSelector } from "@/components/community/AiModelSelector";

interface BlacklistTopic {
  id: string;
  topic: string;
}

interface EmojiNogoTerm {
  id: string;
  term: string;
}

interface PostGroup {
  igMediaId: string;
  postCaption: string | null;
  postPermalink: string | null;
  publishedAt: string | null;
  comments: CommentWithContext[];
}

type SmartStrategy = "warmup" | "afterglow" | "natural" | null;

export default function Community() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [comments, setComments] = useState<CommentWithContext[]>([]);
  const [criticalComments, setCriticalComments] = useState<CommentWithContext[]>([]);
  const [blacklistTopics, setBlacklistTopics] = useState<BlacklistTopic[]>([]);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [emojiNogoTerms, setEmojiNogoTerms] = useState<EmojiNogoTerm[]>([]);
  const [smartStrategy, setSmartStrategy] = useState<SmartStrategy>(null);
  const [sanitizingComments, setSanitizingComments] = useState<Set<string>>(new Set());
  const [selectedAiModel, setSelectedAiModel] = useState("google/gemini-2.5-flash");

  // Group comments by their parent post
  const postGroups = useMemo((): PostGroup[] => {
    const groupMap = new Map<string, PostGroup>();

    comments.forEach((comment) => {
      const key = comment.ig_media_id;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          igMediaId: key,
          postCaption: comment.post_caption || null,
          postPermalink: comment.post_permalink || null,
          publishedAt: comment.post_published_at || null,
          comments: [],
        });
      }

      groupMap.get(key)!.comments.push(comment);
    });

    // Sort groups by most recent comment timestamp
    return Array.from(groupMap.values()).sort((a, b) => {
      const aLatest = Math.max(
        ...a.comments.map((c) => new Date(c.comment_timestamp).getTime())
      );
      const bLatest = Math.max(
        ...b.comments.map((c) => new Date(c.comment_timestamp).getTime())
      );
      return bLatest - aLatest;
    });
  }, [comments]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load blacklist topics
    const { data: topics } = await supabase
      .from("blacklist_topics")
      .select("*")
      .order("created_at", { ascending: false });

    if (topics && topics.length > 0) {
      setBlacklistTopics(topics);
    } else {
      // Create default topic if none exists
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;

      if (userId) {
        const { data: created } = await supabase
          .from("blacklist_topics")
          .insert({ topic: "Pater Brown", user_id: userId })
          .select()
          .maybeSingle();

        if (created) {
          setBlacklistTopics([created]);
        }
      }
    }

    // Load emoji nogo terms
    const { data: emojiTerms } = await supabase
      .from("emoji_nogo_terms")
      .select("*")
      .order("created_at", { ascending: false });

    if (emojiTerms) {
      setEmojiNogoTerms(emojiTerms);
    }

    // Get blacklist for filtering
    const blacklistLower = (topics || []).map((t) => t.topic.toLowerCase());

    // Load comments
    const { data: allComments } = await supabase
      .from("instagram_comments")
      .select("*")
      .eq("is_replied", false)
      .eq("is_hidden", false)
      .order("comment_timestamp", { ascending: false });

    // Load all posts to join by ig_media_id
    const { data: allPosts } = await supabase
      .from("posts")
      .select("id, caption, original_media_url, original_ig_permalink, ig_media_id, published_at");

    // Create a map of ig_media_id -> post data for quick lookup
    const postMap = new Map<string, {
      id: string;
      caption: string | null;
      original_media_url: string | null;
      original_ig_permalink: string | null;
      published_at: string | null;
    }>();

    if (allPosts) {
      allPosts.forEach((post) => {
        if (post.ig_media_id) {
          postMap.set(post.ig_media_id, {
            id: post.id,
            caption: post.caption,
            original_media_url: post.original_media_url,
            original_ig_permalink: post.original_ig_permalink,
            published_at: post.published_at,
          });
        }
      });
    }

    if (allComments) {
      // Filter out comments containing blacklisted topics in comment OR caption
      const filteredComments = allComments.filter((c) => {
        const commentLower = c.comment_text.toLowerCase();
        const postData = postMap.get(c.ig_media_id);
        const captionLower = (postData?.caption || "").toLowerCase();

        // Check if any blacklist topic is in comment or caption
        const isBlacklisted = blacklistLower.some(
          (topic) => commentLower.includes(topic) || captionLower.includes(topic)
        );

        return !isBlacklisted;
      });

      // Map to our interface with post context - default selected to TRUE (toggle on)
      const mappedComments: CommentWithContext[] = filteredComments.map((c) => {
        const postData = postMap.get(c.ig_media_id);
        return {
          ...c,
          post_caption: postData?.caption || null,
          post_image_url: postData?.original_media_url || null,
          post_permalink: postData?.original_ig_permalink || null,
          post_published_at: postData?.published_at || null,
          selected: !c.is_critical && !!c.ai_reply_suggestion, // Default ON if has reply
          editedReply: c.ai_reply_suggestion || "",
          approved: false,
        };
      });

      const critical = mappedComments.filter((c) => c.is_critical);
      const normal = mappedComments.filter((c) => !c.is_critical);

      setCriticalComments(critical);
      setComments(normal);
    }

    // Determine smart strategy based on calendar
    await determineSmartStrategy();
  };

  const determineSmartStrategy = async () => {
    const now = new Date();
    const in60Min = addMinutes(now, 60);
    const before60Min = subMinutes(now, 60);

    // Check for scheduled posts in next 60 minutes (Warm-Up)
    const { data: upcomingPosts } = await supabase
      .from("posts")
      .select("id, scheduled_at")
      .eq("status", "SCHEDULED")
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", in60Min.toISOString())
      .limit(1);

    if (upcomingPosts && upcomingPosts.length > 0) {
      setSmartStrategy("warmup");
      return;
    }

    // Check for posts published in last 60 minutes (After-Glow)
    const { data: recentPosts } = await supabase
      .from("posts")
      .select("id, published_at")
      .eq("status", "PUBLISHED")
      .gte("published_at", before60Min.toISOString())
      .lte("published_at", now.toISOString())
      .limit(1);

    if (recentPosts && recentPosts.length > 0) {
      setSmartStrategy("afterglow");
      return;
    }

    // Default: natural distribution
    setSmartStrategy("natural");
  };

  const fetchComments = async () => {
    setLoading(true);
    toast.info("🔄 Lade Kommentare der letzten 30 Tage...");

    try {
      const { error } = await supabase.functions.invoke("fetch-comments");

      if (error) throw error;

      toast.success("✅ Kommentare geladen!");
      setLastFetch(new Date());

      setAnalyzing(true);
      toast.info("🧠 Analysiere Stimmung & generiere Antworten...");

      const { error: analyzeError } = await supabase.functions.invoke(
        "analyze-comments"
      );

      if (analyzeError) {
        console.error("Analyze error:", analyzeError);
      }

      toast.success("✨ Analyse abgeschlossen!");
      await loadData();
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Fehler beim Laden der Kommentare");
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  };

  // Add multiple blacklist topics at once
  const addBlacklistTopics = async (topics: string[]) => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    const existingTopics = blacklistTopics.map((t) => t.topic.toLowerCase());
    const newTopics = topics.filter(
      (topic) => !existingTopics.includes(topic.toLowerCase())
    );

    if (newTopics.length === 0) {
      toast.info("Alle Begriffe sind bereits auf der Blacklist");
      return;
    }

    const insertData = newTopics.map((topic) => ({
      topic,
      user_id: user.user.id,
    }));

    const { data, error } = await supabase
      .from("blacklist_topics")
      .insert(insertData)
      .select();

    if (error) {
      toast.error("Fehler beim Hinzufügen");
      return;
    }

    if (data) {
      setBlacklistTopics([...data, ...blacklistTopics]);
      toast.success(
        newTopics.length === 1
          ? `"${newTopics[0]}" zur Blacklist hinzugefügt`
          : `${newTopics.length} Begriffe zur Blacklist hinzugefügt`
      );
      // Reload to filter out newly blacklisted comments
      await loadData();
    }
  };

  const removeBlacklistTopic = async (id: string) => {
    await supabase.from("blacklist_topics").delete().eq("id", id);
    setBlacklistTopics(blacklistTopics.filter((t) => t.id !== id));
  };

  // Emoji mapping for retroactive sanitization
  const emojiMappings: Record<string, string[]> = {
    liebe: ["❤️", "💕", "💖", "💗", "💝", "😍", "🥰", "😘", "💋", "😻", "💘", "💓", "💞", "💟", "♥️", "💑", "💏"],
    herzen: ["❤️", "💕", "💖", "💗", "💝", "💘", "💓", "💞", "💟", "♥️", "🖤", "🤍", "💜", "💙", "💚", "🧡", "💛"],
    trauer: ["😢", "😭", "😿", "💔", "🥺", "😥", "😪", "😞", "😔", "🥀"],
    weinen: ["😢", "😭", "😿", "🥺", "😥", "😪"],
    kitsch: ["🥹", "🤗", "😊", "🥰", "💖", "✨", "🌸", "🦋", "🌈", "💫", "🌟", "💝"],
    süß: ["🥹", "🤗", "😊", "🥰", "💖", "🍭", "🧁", "🍬", "🎀"],
    wut: ["😡", "🤬", "💢", "👊", "😤", "🔥"],
    aggression: ["😡", "🤬", "💢", "👊", "🥊", "💥"],
    religion: ["🙏", "✝️", "☪️", "✡️", "🕉️", "☯️", "⛪", "🕌", "🕍"],
    tod: ["💀", "☠️", "⚰️", "🪦", "👻", "🥀"],
  };

  const findViolatingEmojis = (text: string, newTerm: string): boolean => {
    const termLower = newTerm.toLowerCase();
    const emojisToCheck = emojiMappings[termLower] || [];

    // Also check if the term itself appears as part of any emoji mapping key
    for (const [key, emojis] of Object.entries(emojiMappings)) {
      if (key.includes(termLower) || termLower.includes(key)) {
        emojisToCheck.push(...emojis);
      }
    }

    // Check if any of the forbidden emojis are in the text
    return emojisToCheck.some((emoji) => text.includes(emoji));
  };

  const sanitizeExistingReplies = async (newTerms: string[]) => {
    // Find comments that have replies containing forbidden emojis for ANY of the new terms
    const violatingComments = comments.filter(
      (c) => c.editedReply && newTerms.some((term) => findViolatingEmojis(c.editedReply!, term))
    );

    if (violatingComments.length === 0) {
      return;
    }

    toast.info(`🔄 Korrigiere Emoji-Stil in ${violatingComments.length} Antworten...`);

    // Mark comments as being sanitized IMMEDIATELY for UI feedback
    const sanitizingIds = new Set(violatingComments.map((c) => c.id));
    setSanitizingComments(sanitizingIds);

    // Regenerate ALL violating replies in PARALLEL
    const regeneratePromises = violatingComments.map(async (comment) => {
      try {
        const { data, error } = await supabase.functions.invoke("regenerate-reply", {
          body: { comment_id: comment.id, model: selectedAiModel },
        });

        if (!error && data?.new_reply) {
          // Update local state with new reply immediately when this one completes
          setComments((prev) =>
            prev.map((c) =>
              c.id === comment.id
                ? { ...c, editedReply: data.new_reply, approved: false }
                : c
            )
          );
          // Remove this comment from sanitizing set
          setSanitizingComments((prev) => {
            const next = new Set(prev);
            next.delete(comment.id);
            return next;
          });
          return { success: true, id: comment.id };
        }
        return { success: false, id: comment.id };
      } catch (err) {
        console.error("Regenerate error:", err);
        return { success: false, id: comment.id };
      }
    });

    // Wait for all to complete
    const results = await Promise.all(regeneratePromises);
    const successCount = results.filter((r) => r.success).length;

    // Clear any remaining sanitizing state
    setSanitizingComments(new Set());
    
    if (successCount > 0) {
      toast.success(`✨ ${successCount} Antworten bereinigt!`);
    }
  };

  // Add multiple emoji nogo terms at once
  const addEmojiNogoTerms = async (terms: string[]) => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    const existingTerms = emojiNogoTerms.map((t) => t.term.toLowerCase());
    const newTerms = terms.filter(
      (term) => !existingTerms.includes(term.toLowerCase())
    );

    if (newTerms.length === 0) {
      toast.info("Alle Begriffe sind bereits in der Liste");
      return;
    }

    const insertData = newTerms.map((term) => ({
      term,
      user_id: user.user.id,
    }));

    const { data, error } = await supabase
      .from("emoji_nogo_terms")
      .insert(insertData)
      .select();

    if (error) {
      toast.error("Fehler beim Hinzufügen");
      return;
    }

    if (data) {
      setEmojiNogoTerms([...data, ...emojiNogoTerms]);
      toast.success(
        newTerms.length === 1
          ? `"${newTerms[0]}" zu Emoji-No-Gos hinzugefügt`
          : `${newTerms.length} Begriffe zu Emoji-No-Gos hinzugefügt`
      );

      // Retroactive sanitization for ALL new terms at once (parallel)
      await sanitizeExistingReplies(newTerms);
    }
  };

  const removeEmojiNogoTerm = async (id: string) => {
    await supabase.from("emoji_nogo_terms").delete().eq("id", id);
    setEmojiNogoTerms(emojiNogoTerms.filter((t) => t.id !== id));
  };

  const moderateComment = async (
    commentId: string,
    action: "hide" | "delete" | "block"
  ) => {
    const { error } = await supabase.functions.invoke("moderate-comment", {
      body: { comment_id: commentId, action },
    });

    if (error) {
      toast.error(`Fehler: ${action}`);
      return;
    }

    toast.success(
      action === "hide"
        ? "Kommentar verborgen"
        : action === "delete"
        ? "Kommentar gelöscht"
        : "User blockiert"
    );

    setCriticalComments((prev) => prev.filter((c) => c.id !== commentId));
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  const toggleCommentSelection = (id: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const updateReplyText = (id: string, text: string) => {
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, editedReply: text } : c))
    );
  };

  const approveAllForPost = (igMediaId: string) => {
    setComments((prev) =>
      prev.map((c) =>
        c.ig_media_id === igMediaId && c.editedReply
          ? { ...c, selected: true }
          : c
      )
    );
    toast.success("✅ Alle Antworten für diesen Post aktiviert");
  };

  const smartReply = async () => {
    // Only send selected comments
    const selectedComments = comments.filter((c) => c.selected && c.editedReply);

    if (selectedComments.length === 0) {
      toast.error("Keine Antworten ausgewählt");
      return;
    }

    setSending(true);

    let toSend: CommentWithContext[];
    let strategyName: string;

    switch (smartStrategy) {
      case "warmup":
        // Warm-Up: Send replies to oldest comments first (engagement before post)
        toSend = [...selectedComments].sort(
          (a, b) =>
            new Date(a.comment_timestamp).getTime() -
            new Date(b.comment_timestamp).getTime()
        );
        strategyName = "🔥 Warm-Up";
        break;
      case "afterglow":
        // After-Glow: Send replies to newest comments first (push engagement after post)
        toSend = [...selectedComments].sort(
          (a, b) =>
            new Date(b.comment_timestamp).getTime() -
            new Date(a.comment_timestamp).getTime()
        );
        strategyName = "✨ After-Glow";
        break;
      default:
        // Natural: Random order with delays
        toSend = [...selectedComments].sort(() => Math.random() - 0.5);
        strategyName = "🌿 Natürlich";
    }

    toast.info(`${strategyName}: Sende ${toSend.length} Antworten...`);

    let sentCount = 0;
    for (const comment of toSend) {
      try {
        const { error } = await supabase.functions.invoke("reply-to-comment", {
          body: { comment_id: comment.id, reply_text: comment.editedReply },
        });

        if (!error) {
          sentCount++;
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
        }
      } catch (err) {
        console.error("Reply error:", err);
      }

      // Delay between replies - longer for natural mode
      const delay = smartStrategy === "natural" ? Math.random() * 2000 + 1000 : 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    toast.success(`✅ ${sentCount} Antworten gesendet!`);
    setSending(false);
  };

  const testRun = () => {
    const selectedComments = comments.filter((c) => c.selected && c.editedReply);
    toast.info(
      `🧪 Test-Lauf: ${selectedComments.length} Antworten würden gesendet werden`,
      {
        description: `Strategie: ${
          smartStrategy === "warmup"
            ? "Warm-Up (älteste zuerst)"
            : smartStrategy === "afterglow"
            ? "After-Glow (neueste zuerst)"
            : "Natürlich (zufällig verteilt)"
        }`,
        duration: 5000,
      }
    );
  };

  const selectedCount = comments.filter((c) => c.selected && c.editedReply).length;

  return (
    <AppLayout
      title="Community"
      description="Engagement-Zentrale für deine Instagram-Fans"
    >
      <div className="space-y-6 pb-28">
        {/* Header Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1">
            <RulesConfigPanel
              emojiNogoTerms={emojiNogoTerms}
              blacklistTopics={blacklistTopics}
              onAddEmojiNogoTerms={addEmojiNogoTerms}
              onRemoveEmojiNogoTerm={removeEmojiNogoTerm}
              onAddBlacklistTopics={addBlacklistTopics}
              onRemoveBlacklistTopic={removeBlacklistTopic}
            />
          </div>
          <AiModelSelector
            selectedModel={selectedAiModel}
            onModelChange={setSelectedAiModel}
          />
        </div>

        {/* Fetch Button & Stats */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-card border">
          <div>
            <h3 className="font-medium text-sm">Kommentare synchronisieren</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lastFetch
                ? `Letzter Sync: ${formatDistanceToNow(lastFetch, {
                    locale: de,
                    addSuffix: true,
                  })}`
                : "Noch nicht synchronisiert"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchComments}
            disabled={loading || analyzing}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Lade..." : analyzing ? "Analysiere..." : "Sync"}
          </Button>
        </div>

        {/* Critical Comments Section */}
        {criticalComments.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="font-medium text-sm text-destructive">
                  Zur Prüfung ({criticalComments.length})
                </h3>
              </div>
              <div className="space-y-2">
                {criticalComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="flex items-start justify-between gap-3 p-3 bg-background rounded-lg border border-destructive/20"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-sm">
                          @{comment.commenter_username}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(
                            new Date(comment.comment_timestamp),
                            "dd.MM. HH:mm",
                            { locale: de }
                          )}
                        </span>
                        {comment.sentiment_score !== null && (
                          <Badge variant="destructive" className="text-xs">
                            Score: {comment.sentiment_score.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {comment.comment_text}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => moderateComment(comment.id, "hide")}
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => moderateComment(comment.id, "block")}
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => moderateComment(comment.id, "delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Post-Grouped Comments */}
        {postGroups.length > 0 ? (
          <div className="space-y-5">
            {postGroups.map((group) => (
              <PostCard
                key={group.igMediaId}
                group={group}
                onToggleSelect={toggleCommentSelection}
                onUpdateReply={updateReplyText}
                onApproveAll={approveAllForPost}
                sanitizingComments={sanitizingComments}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">Keine offenen Kommentare</p>
              <p className="text-sm mt-1">
                Synchronisiere Kommentare um zu starten
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Fixed Action Bar */}
      <ActionBar
        selectedCount={selectedCount}
        totalCount={comments.length}
        smartStrategy={smartStrategy}
        sending={sending}
        onSmartReply={smartReply}
        onTestRun={testRun}
      />
    </AppLayout>
  );
}
