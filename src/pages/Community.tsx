import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  MessageCircle, 
  RefreshCw, 
  AlertTriangle, 
  Flame, 
  Sparkles,
  EyeOff,
  Ban,
  Trash2,
  X,
  Plus,
  Send,
  Clock
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface Comment {
  id: string;
  ig_comment_id: string;
  ig_media_id: string;
  commenter_username: string;
  comment_text: string;
  comment_timestamp: string;
  is_replied: boolean;
  is_hidden: boolean;
  is_critical: boolean;
  sentiment_score: number | null;
  ai_reply_suggestion: string | null;
  selected?: boolean;
  editedReply?: string;
}

interface BlacklistTopic {
  id: string;
  topic: string;
}

interface EmojiNogoTerm {
  id: string;
  term: string;
}

export default function Community() {
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [criticalComments, setCriticalComments] = useState<Comment[]>([]);
  const [blacklistTopics, setBlacklistTopics] = useState<BlacklistTopic[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [emojiNogoTerms, setEmojiNogoTerms] = useState<EmojiNogoTerm[]>([]);
  const [newEmojiTerm, setNewEmojiTerm] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load blacklist topics
    const { data: topics, error: topicsError } = await supabase
      .from('blacklist_topics')
      .select('*')
      .order('created_at', { ascending: false });

    if (topicsError) {
      console.error('Failed to load blacklist topics:', topicsError);
    }

    if (topics && topics.length > 0) {
      setBlacklistTopics(topics);
    } else {
      // Create default topic if none exists
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;

      if (userId) {
        const { data: created, error: createErr } = await supabase
          .from('blacklist_topics')
          .insert({ topic: 'Pater Brown', user_id: userId })
          .select()
          .maybeSingle();

        if (!createErr && created) {
          setBlacklistTopics([created]);
        } else {
          setBlacklistTopics([]);
        }
      } else {
        setBlacklistTopics([]);
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

    // Load comments
    const { data: allComments } = await supabase
      .from('instagram_comments')
      .select('*')
      .eq('is_replied', false)
      .eq('is_hidden', false)
      .order('comment_timestamp', { ascending: false });

    if (allComments) {
      const critical = allComments.filter(c => c.is_critical);
      const normal = allComments.filter(c => !c.is_critical);

      setCriticalComments(critical.map(c => ({ ...c, selected: false, editedReply: c.ai_reply_suggestion || '' })));
      setComments(normal.map(c => ({ ...c, selected: true, editedReply: c.ai_reply_suggestion || '' })));
    }
  };

  const fetchComments = async () => {
    setLoading(true);
    toast.info("🔄 Lade Kommentare der letzten 30 Tage...");

    try {
      const { error } = await supabase.functions.invoke('fetch-comments');
      
      if (error) throw error;

      toast.success("✅ Kommentare geladen!");
      setLastFetch(new Date());
      
      // Now analyze them
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
    }
  };

  const removeBlacklistTopic = async (id: string) => {
    await supabase.from('blacklist_topics').delete().eq('id', id);
    setBlacklistTopics(blacklistTopics.filter(t => t.id !== id));
  };

  const addEmojiNogoTerm = async () => {
    if (!newEmojiTerm.trim()) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;

    const { data, error } = await supabase
      .from('emoji_nogo_terms')
      .insert({ term: newEmojiTerm.trim(), user_id: user.user.id })
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

  const sendReplies = async (mode: 'warmup' | 'afterglow') => {
    const selectedComments = comments.filter(c => c.selected && c.editedReply);
    
    if (selectedComments.length === 0) {
      toast.error("Keine Kommentare ausgewählt");
      return;
    }

    setSending(true);
    
    // For warmup: send 50% immediately
    // For afterglow: queue the remaining 50%
    const halfIndex = Math.ceil(selectedComments.length / 2);
    const toSendNow = mode === 'warmup' 
      ? selectedComments.slice(0, halfIndex)
      : selectedComments.slice(halfIndex);

    toast.info(`${mode === 'warmup' ? '🔥 Warm-Up' : '✨ After-Glow'}: Sende ${toSendNow.length} Antworten...`);

    let sentCount = 0;
    for (const comment of toSendNow) {
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

      // Small delay between replies
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    toast.success(`✅ ${sentCount} Antworten gesendet!`);
    setSending(false);
  };

  const selectedCount = comments.filter(c => c.selected).length;

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
              Die KI vermeidet Emojis, die mit diesen Begriffen assoziiert sind (z.B. "Liebe" → keine ❤️😍💕)
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
              Kommentare mit diesen Wörtern werden automatisch ausgeblendet
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

        {/* Normal Comments - Bulk Approval */}
        {comments.length > 0 ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Antworten genehmigen ({selectedCount} von {comments.length} ausgewählt)
              </CardTitle>
              <CardDescription>
                KI-generierte Antworten prüfen und bei Bedarf anpassen
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {comments.map(comment => (
                <div key={comment.id} className="p-4 bg-muted/30 rounded-lg border">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={comment.selected}
                      onCheckedChange={() => toggleCommentSelection(comment.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">@{comment.commenter_username}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(comment.comment_timestamp), 'dd.MM.yyyy HH:mm', { locale: de })}
                        </span>
                        {comment.sentiment_score !== null && comment.sentiment_score > 0.5 && (
                          <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                            Positiv
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{comment.comment_text}</p>
                      
                      <Separator className="my-2" />
                      
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Antwort-Vorschlag
                        </label>
                        <Textarea
                          value={comment.editedReply || ''}
                          onChange={(e) => updateReplyText(comment.id, e.target.value)}
                          placeholder="Antwort eingeben..."
                          rows={2}
                          className="text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Keine offenen Kommentare</p>
              <p className="text-sm">Lade Kommentare um zu starten</p>
            </CardContent>
          </Card>
        )}

        {/* Strategy Buttons */}
        {comments.length > 0 && selectedCount > 0 && (
          <div className="flex gap-3 justify-end">
            <Button
              size="lg"
              variant="outline"
              onClick={() => sendReplies('warmup')}
              disabled={sending}
              className="gap-2"
            >
              <Flame className="h-4 w-4 text-orange-500" />
              🔥 Warm-Up starten ({Math.ceil(selectedCount / 2)})
            </Button>
            <Button
              size="lg"
              onClick={() => sendReplies('afterglow')}
              disabled={sending}
              className="gap-2"
            >
              <Clock className="h-4 w-4" />
              ✨ After-Glow starten ({Math.floor(selectedCount / 2)})
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
