import { useState, useEffect } from "react";
import { GlobalLayout } from "@/components/GlobalLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AiModelSelector } from "@/components/community/AiModelSelector";

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

export default function Community() {
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash");
  const [generatingReply, setGeneratingReply] = useState<string | null>(null);
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

  // Initialize reply texts from AI suggestions
  useEffect(() => {
    const newTexts: Record<string, string> = {};
    comments.forEach(c => {
      if (c.ai_reply_suggestion && !replyTexts[c.id]) {
        newTexts[c.id] = c.ai_reply_suggestion;
      }
    });
    if (Object.keys(newTexts).length > 0) {
      setReplyTexts(prev => ({ ...prev, ...newTexts }));
    }
  }, [comments]);

  // Listen for refresh events from the chat
  useEffect(() => {
    const handleRefresh = () => {
      queryClient.invalidateQueries({ queryKey: ['community-comments'] });
    };
    
    window.addEventListener('refresh-comments', handleRefresh);
    return () => window.removeEventListener('refresh-comments', handleRefresh);
  }, [queryClient]);

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

  // Generate smart reply using selected model
  const handleSmartReply = async (commentId: string) => {
    setGeneratingReply(commentId);
    
    try {
      const { data, error } = await supabase.functions.invoke("regenerate-reply", {
        body: { comment_id: commentId, model: selectedModel },
      });
      
      if (error) throw error;
      
      // Update local state with the new reply
      if (data?.new_reply) {
        setReplyTexts(prev => ({ ...prev, [commentId]: data.new_reply }));
      }
      
      toast.success("✨ Antwort generiert!");
      refetch();
    } catch (err) {
      console.error("Generate error:", err);
      toast.error("Fehler bei der Generierung");
    } finally {
      setGeneratingReply(null);
    }
  };

  // Send reply to queue
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
      
      // Add to reply queue
      const { error: queueError } = await supabase
        .from("comment_reply_queue")
        .insert({
          user_id: user.user.id,
          ig_comment_id: comment.ig_comment_id,
          comment_id: comment.id,
          reply_text: replyText,
          status: "pending",
        });
      
      if (queueError) throw queueError;
      
      // Mark comment as replied
      await supabase
        .from("instagram_comments")
        .update({ is_replied: true, ai_reply_suggestion: replyText })
        .eq("id", comment.id);
      
      toast.success("✅ In Warteschlange!");
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
              onModelChange={setSelectedModel}
              disabled={generatingReply !== null}
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
            {comments.map((comment) => (
              <Card key={comment.id} className="overflow-hidden rounded-2xl border-border/50 hover:border-primary/30 transition-all hover:shadow-lg">
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
                          <Textarea
                            placeholder="Deine Antwort..."
                            value={replyTexts[comment.id] || ""}
                            onChange={(e) => handleReplyTextChange(comment.id, e.target.value)}
                            className="min-h-[90px] resize-none rounded-xl border-border/50 focus:border-primary/50"
                          />
                          
                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSmartReply(comment.id)}
                              disabled={generatingReply === comment.id}
                              className="gap-2 rounded-xl h-9"
                            >
                              {generatingReply === comment.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Sparkles className="h-4 w-4" />
                              )}
                              Smart Reply
                            </Button>
                            
                            <Button
                              size="sm"
                              onClick={() => handleSendReply(comment)}
                              disabled={sendingReply === comment.id || !replyTexts[comment.id]?.trim()}
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
            ))}
          </div>
        )}
      </div>
    </GlobalLayout>
  );
}
