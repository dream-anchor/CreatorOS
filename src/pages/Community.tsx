import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  X,
  Plus,
  Rocket
} from "lucide-react";
import { format, formatDistanceToNow, addMinutes, subMinutes } from "date-fns";
import { de } from "date-fns/locale";
import { CommentWithContext } from "@/components/community/CommentCard";
import { PostCommentGroup } from "@/components/community/PostCommentGroup";

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

type SmartStrategy = 'warmup' | 'afterglow' | 'natural' | null;

export default function Community() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [comments, setComments] = useState<CommentWithContext[]>([]);
  const [criticalComments, setCriticalComments] = useState<CommentWithContext[]>([]);
  const [blacklistTopics, setBlacklistTopics] = useState<BlacklistTopic[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [emojiNogoTerms, setEmojiNogoTerms] = useState<EmojiNogoTerm[]>([]);
  const [newEmojiTerm, setNewEmojiTerm] = useState("");
  const [smartStrategy, setSmartStrategy] = useState<SmartStrategy>(null);
  const [sanitizingComments, setSanitizingComments] = useState<Set<string>>(new Set());

  // Group comments by their parent post
  const postGroups = useMemo((): PostGroup[] => {
    const groupMap = new Map<string, PostGroup>();

    comments.forEach(comment => {
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
      const aLatest = Math.max(...a.comments.map(c => new Date(c.comment_timestamp).getTime()));
      const bLatest = Math.max(...b.comments.map(c => new Date(c.comment_timestamp).getTime()));
      return bLatest - aLatest;
    });
  }, [comments]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load blacklist topics
    const { data: topics } = await supabase
      .from('blacklist_topics')
      .select('*')
      .order('created_at', { ascending: false });

    if (topics && topics.length > 0) {
      setBlacklistTopics(topics);
    } else {
      // Create default topic if none exists
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;

      if (userId) {
        const { data: created } = await supabase
          .from('blacklist_topics')
          .insert({ topic: 'Pater Brown', user_id: userId })
          .select()
          .maybeSingle();

        if (created) {
          setBlacklistTopics([created]);
        }
      }
    }

    // Load emoji nogo terms
    const { data: emojiTerms } = await supabase
      .from('emoji_nogo_terms')
      .select('*')
      .order('created_at', { ascending: false });

    if (emojiTerms) {
      setEmojiNogoTerms(emojiTerms);
    }

    // Get blacklist for filtering
    const blacklistLower = (topics || []).map(t => t.topic.toLowerCase());

    // Load comments with post context - filter blacklist already here
    const { data: allComments } = await supabase
      .from('instagram_comments')
      .select(`
        *,
        posts:post_id (
          caption,
          original_media_url,
          original_ig_permalink,
          ig_media_id,
          published_at
        )
      `)
      .eq('is_replied', false)
      .eq('is_hidden', false)
      .order('comment_timestamp', { ascending: false });

    if (allComments) {
      // Filter out comments containing blacklisted topics in comment OR caption
      const filteredComments = allComments.filter(c => {
        const commentLower = c.comment_text.toLowerCase();
        const captionLower = (c.posts?.caption || '').toLowerCase();
        
        // Check if any blacklist topic is in comment or caption
        const isBlacklisted = blacklistLower.some(topic => 
          commentLower.includes(topic) || captionLower.includes(topic)
        );
        
        return !isBlacklisted;
      });

      // Map to our interface with post context
      const mappedComments: CommentWithContext[] = filteredComments.map(c => ({
        ...c,
        post_caption: c.posts?.caption || null,
        post_image_url: c.posts?.original_media_url || null,
        post_permalink: c.posts?.original_ig_permalink || null,
        post_published_at: c.posts?.published_at || null,
        selected: !c.is_critical,
        editedReply: c.ai_reply_suggestion || '',
        approved: false,
      }));

      const critical = mappedComments.filter(c => c.is_critical);
      const normal = mappedComments.filter(c => !c.is_critical);

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
      .from('posts')
      .select('id, scheduled_at')
      .eq('status', 'SCHEDULED')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in60Min.toISOString())
      .limit(1);

    if (upcomingPosts && upcomingPosts.length > 0) {
      setSmartStrategy('warmup');
      return;
    }

    // Check for posts published in last 60 minutes (After-Glow)
    const { data: recentPosts } = await supabase
      .from('posts')
      .select('id, published_at')
      .eq('status', 'PUBLISHED')
      .gte('published_at', before60Min.toISOString())
      .lte('published_at', now.toISOString())
      .limit(1);

    if (recentPosts && recentPosts.length > 0) {
      setSmartStrategy('afterglow');
      return;
    }

    // Default: natural distribution
    setSmartStrategy('natural');
  };

  const fetchComments = async () => {
    setLoading(true);
    toast.info("🔄 Lade Kommentare der letzten 30 Tage...");

    try {
      const { error } = await supabase.functions.invoke('fetch-comments');
      
      if (error) throw error;

      toast.success("✅ Kommentare geladen!");
      setLastFetch(new Date());
      
      setAnalyzing(true);
      toast.info("🧠 Analysiere Stimmung & generiere Antworten...");

      const { error: analyzeError } = await supabase.functions.invoke('analyze-comments');
      
      if (analyzeError) {
        console.error('Analyze error:', analyzeError);
      }

      toast.success("✨ Analyse abgeschlossen!");
      await loadData();

    } catch (err) {
      console.error('Fetch error:', err);
      toast.error("Fehler beim Laden der Kommentare");
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  };

  const addBlacklistTopic = async () => {
    if (!newTopic.trim()) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    const { data, error } = await supabase
      .from('blacklist_topics')
      .insert({ topic: newTopic.trim(), user_id: user.user.id })
      .select()
      .single();

    if (error) {
      toast.error("Fehler beim Hinzufügen");
      return;
    }

    if (data) {
      setBlacklistTopics([data, ...blacklistTopics]);
      setNewTopic("");
      toast.success(`"${data.topic}" zur Blacklist hinzugefügt`);
      // Reload to filter out newly blacklisted comments
      await loadData();
    }
  };

  const removeBlacklistTopic = async (id: string) => {
    await supabase.from('blacklist_topics').delete().eq('id', id);
    setBlacklistTopics(blacklistTopics.filter(t => t.id !== id));
  };

  // Emoji mapping for retroactive sanitization
  const emojiMappings: Record<string, string[]> = {
    'liebe': ['❤️', '💕', '💖', '💗', '💝', '😍', '🥰', '😘', '💋', '😻', '💘', '💓', '💞', '💟', '♥️', '💑', '💏'],
    'herzen': ['❤️', '💕', '💖', '💗', '💝', '💘', '💓', '💞', '💟', '♥️', '🖤', '🤍', '💜', '💙', '💚', '🧡', '💛'],
    'trauer': ['😢', '😭', '😿', '💔', '🥺', '😥', '😪', '😞', '😔', '🥀'],
    'weinen': ['😢', '😭', '😿', '🥺', '😥', '😪'],
    'kitsch': ['🥹', '🤗', '😊', '🥰', '💖', '✨', '🌸', '🦋', '🌈', '💫', '🌟', '💝'],
    'süß': ['🥹', '🤗', '😊', '🥰', '💖', '🍭', '🧁', '🍬', '🎀'],
    'wut': ['😡', '🤬', '💢', '👊', '😤', '🔥'],
    'aggression': ['😡', '🤬', '💢', '👊', '🥊', '💥'],
    'religion': ['🙏', '✝️', '☪️', '✡️', '🕉️', '☯️', '⛪', '🕌', '🕍'],
    'tod': ['💀', '☠️', '⚰️', '🪦', '👻', '🥀'],
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
    return emojisToCheck.some(emoji => text.includes(emoji));
  };

  const sanitizeExistingReplies = async (newTerm: string) => {
    // Find comments that have replies containing forbidden emojis
    const violatingComments = comments.filter(c => 
      c.editedReply && findViolatingEmojis(c.editedReply, newTerm)
    );

    if (violatingComments.length === 0) {
      return;
    }

    toast.info(`🔄 Korrigiere Emoji-Stil in ${violatingComments.length} Antworten...`);

    // Mark comments as being sanitized
    setSanitizingComments(new Set(violatingComments.map(c => c.id)));

    // Regenerate each violating reply
    for (const comment of violatingComments) {
      try {
        const { data, error } = await supabase.functions.invoke('regenerate-reply', {
          body: { comment_id: comment.id }
        });

        if (!error && data?.new_reply) {
          // Update local state with new reply
          setComments(prev => prev.map(c => 
            c.id === comment.id 
              ? { ...c, editedReply: data.new_reply, approved: false } 
              : c
          ));
        }
      } catch (err) {
        console.error('Regenerate error:', err);
      }
    }

    // Clear sanitizing state
    setSanitizingComments(new Set());
    toast.success(`✨ ${violatingComments.length} Antworten bereinigt!`);
  };

  const addEmojiNogoTerm = async () => {
    if (!newEmojiTerm.trim()) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    const termToAdd = newEmojiTerm.trim();

    const { data, error } = await supabase
      .from('emoji_nogo_terms')
      .insert({ term: termToAdd, user_id: user.user.id })
      .select()
      .single();

    if (error) {
      toast.error("Fehler beim Hinzufügen");
      return;
    }

    if (data) {
      setEmojiNogoTerms([data, ...emojiNogoTerms]);
      setNewEmojiTerm("");
      toast.success(`"${data.term}" zu Emoji-No-Gos hinzugefügt`);
      
      // Retroactive sanitization
      await sanitizeExistingReplies(termToAdd);
    }
  };

  const removeEmojiNogoTerm = async (id: string) => {
    await supabase.from('emoji_nogo_terms').delete().eq('id', id);
    setEmojiNogoTerms(emojiNogoTerms.filter(t => t.id !== id));
  };

  const moderateComment = async (commentId: string, action: 'hide' | 'delete' | 'block') => {
    const { error } = await supabase.functions.invoke('moderate-comment', {
      body: { comment_id: commentId, action }
    });

    if (error) {
      toast.error(`Fehler: ${action}`);
      return;
    }

    toast.success(
      action === 'hide' ? 'Kommentar verborgen' :
      action === 'delete' ? 'Kommentar gelöscht' :
      'User blockiert'
    );

    setCriticalComments(prev => prev.filter(c => c.id !== commentId));
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const toggleCommentSelection = (id: string) => {
    setComments(prev => prev.map(c => 
      c.id === id ? { ...c, selected: !c.selected } : c
    ));
  };

  const updateReplyText = (id: string, text: string) => {
    setComments(prev => prev.map(c => 
      c.id === id ? { ...c, editedReply: text } : c
    ));
  };

  const approveComment = (id: string) => {
    setComments(prev => prev.map(c => 
      c.id === id ? { ...c, approved: true, selected: true } : c
    ));
    toast.success("✅ Antwort freigegeben");
  };

  const approveAllForPost = (igMediaId: string) => {
    const affectedCount = comments.filter(c => c.ig_media_id === igMediaId && !c.approved && c.editedReply).length;
    
    setComments(prev => prev.map(c => 
      c.ig_media_id === igMediaId && c.editedReply 
        ? { ...c, approved: true, selected: true } 
        : c
    ));
    
    if (affectedCount > 0) {
      toast.success(`✅ ${affectedCount} Antworten für diesen Post freigegeben`);
    }
  };

  const smartReply = async () => {
    // Only send approved comments
    const approvedComments = comments.filter(c => c.approved && c.editedReply);
    
    if (approvedComments.length === 0) {
      toast.error("Keine freigegebenen Antworten");
      return;
    }

    setSending(true);

    let toSend: CommentWithContext[];
    let strategyName: string;

    switch (smartStrategy) {
      case 'warmup':
        // Warm-Up: Send replies to oldest comments first (engagement before post)
        toSend = [...approvedComments].sort(
          (a, b) => new Date(a.comment_timestamp).getTime() - new Date(b.comment_timestamp).getTime()
        );
        strategyName = "🔥 Warm-Up";
        break;
      case 'afterglow':
        // After-Glow: Send replies to newest comments first (push engagement after post)
        toSend = [...approvedComments].sort(
          (a, b) => new Date(b.comment_timestamp).getTime() - new Date(a.comment_timestamp).getTime()
        );
        strategyName = "✨ After-Glow";
        break;
      default:
        // Natural: Random order with delays
        toSend = [...approvedComments].sort(() => Math.random() - 0.5);
        strategyName = "🌿 Natürlich";
    }

    toast.info(`${strategyName}: Sende ${toSend.length} Antworten...`);

    let sentCount = 0;
    for (const comment of toSend) {
      try {
        const { error } = await supabase.functions.invoke('reply-to-comment', {
          body: { comment_id: comment.id, reply_text: comment.editedReply }
        });

        if (!error) {
          sentCount++;
          setComments(prev => prev.filter(c => c.id !== comment.id));
        }
      } catch (err) {
        console.error('Reply error:', err);
      }

      // Delay between replies - longer for natural mode
      const delay = smartStrategy === 'natural' 
        ? Math.random() * 2000 + 1000 // 1-3 seconds
        : 500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    toast.success(`✅ ${sentCount} Antworten gesendet!`);
    setSending(false);
  };

  const approvedCount = comments.filter(c => c.approved).length;

  const getStrategyInfo = () => {
    switch (smartStrategy) {
      case 'warmup':
        return { icon: '🔥', label: 'Warm-Up Modus', desc: 'Post geplant in < 60 Min – Älteste Kommentare zuerst' };
      case 'afterglow':
        return { icon: '✨', label: 'After-Glow Modus', desc: 'Post veröffentlicht vor < 60 Min – Neueste zuerst' };
      default:
        return { icon: '🌿', label: 'Natürlicher Modus', desc: 'Kein Post in Sicht – Zufällige Verteilung' };
    }
  };

  const strategyInfo = getStrategyInfo();

  return (
    <AppLayout 
      title="💬 Community" 
      description="Engagement-Zentrale für deine Instagram-Fans"
    >
      <div className="space-y-6">
        {/* Emoji No-Go Terms */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              ⛔ Emoji-No-Gos (Begriffe)
            </CardTitle>
            <CardDescription>
              Die KI vermeidet Emojis, die mit diesen Begriffen assoziiert sind
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-3">
              {emojiNogoTerms.map(term => (
                <Badge key={term.id} variant="outline" className="gap-1 pr-1 border-destructive/50 text-destructive">
                  ⛔ {term.term}
                  <button
                    onClick={() => removeEmojiNogoTerm(term.id)}
                    className="ml-1 hover:bg-destructive/20 rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="z.B. Liebe, Herzen, Kitsch, Trauer"
                value={newEmojiTerm}
                onChange={(e) => setNewEmojiTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addEmojiNogoTerm()}
                className="max-w-xs"
              />
              <Button size="sm" variant="outline" onClick={addEmojiNogoTerm}>
                <Plus className="h-4 w-4 mr-1" />
                Hinzufügen
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Blacklist Topics */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <EyeOff className="h-4 w-4" />
              Themen ausblenden
            </CardTitle>
            <CardDescription>
              Kommentare (und zugehörige Posts) mit diesen Wörtern werden komplett ausgeblendet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-3">
              {blacklistTopics.map(topic => (
                <Badge key={topic.id} variant="secondary" className="gap-1 pr-1">
                  {topic.topic}
                  <button
                    onClick={() => removeBlacklistTopic(topic.id)}
                    className="ml-1 hover:bg-destructive/20 rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Neues Thema hinzufügen..."
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addBlacklistTopic()}
                className="max-w-xs"
              />
              <Button size="sm" variant="outline" onClick={addBlacklistTopic}>
                <Plus className="h-4 w-4 mr-1" />
                Hinzufügen
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Fetch Button & Stats */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium">Offene Kommentare</h3>
            <p className="text-sm text-muted-foreground">
              {lastFetch 
                ? `Letzter Sync: ${formatDistanceToNow(lastFetch, { locale: de, addSuffix: true })}`
                : 'Noch nicht synchronisiert'}
            </p>
          </div>
          <Button onClick={fetchComments} disabled={loading || analyzing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Lade...' : analyzing ? 'Analysiere...' : 'Kommentare laden'}
          </Button>
        </div>

        {/* Smart Strategy Info */}
        {smartStrategy && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2">
              <span className="text-xl">{strategyInfo.icon}</span>
              <div>
                <p className="font-medium text-sm">{strategyInfo.label}</p>
                <p className="text-xs text-muted-foreground">{strategyInfo.desc}</p>
              </div>
            </div>
          </div>
        )}

        {/* Critical Comments Section */}
        {criticalComments.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                ⚠️ Zur Prüfung ({criticalComments.length})
              </CardTitle>
              <CardDescription>
                Diese Kommentare enthalten möglicherweise kritische Inhalte
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {criticalComments.map(comment => (
                <div key={comment.id} className="p-3 bg-background rounded-lg border border-destructive/20">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">@{comment.commenter_username}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(comment.comment_timestamp), 'dd.MM. HH:mm', { locale: de })}
                        </span>
                        {comment.sentiment_score !== null && (
                          <Badge variant="destructive" className="text-xs">
                            Score: {comment.sentiment_score.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{comment.comment_text}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => moderateComment(comment.id, 'hide')}
                      >
                        <EyeOff className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => moderateComment(comment.id, 'block')}
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => moderateComment(comment.id, 'delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Post-Grouped Comments */}
        {postGroups.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Antworten nach Post ({approvedCount} freigegeben / {comments.length} gesamt)
              </h3>
              <p className="text-sm text-muted-foreground">
                {postGroups.length} Post{postGroups.length !== 1 ? 's' : ''} mit offenen Kommentaren
              </p>
            </div>

            {postGroups.map(group => (
              <PostCommentGroup
                key={group.igMediaId}
                group={group}
                onToggleSelect={toggleCommentSelection}
                onUpdateReply={updateReplyText}
                onApprove={approveComment}
                onApproveAll={approveAllForPost}
                sanitizingComments={sanitizingComments}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Keine offenen Kommentare</p>
              <p className="text-sm">Lade Kommentare um zu starten</p>
            </CardContent>
          </Card>
        )}

        {/* Smart Reply Button */}
        {comments.length > 0 && approvedCount > 0 && (
          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={smartReply}
              disabled={sending}
              className="gap-2"
            >
              {sending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              🚀 Smart Reply starten ({approvedCount})
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
