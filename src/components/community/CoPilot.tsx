import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sparkles, X, Send, Loader2, ExternalLink, MessageCircle, User, AlertTriangle, Copy, Maximize2, Minimize2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getInstagramUrl } from "@/lib/instagram-utils";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults?: ToolResult[];
  timestamp: Date;
}

interface ToolResult {
  function_name: string;
  result: any;
}

interface CoPilotProps {
  onNavigateToPost?: (postId: string) => void;
  onNavigateToComment?: (commentId: string) => void;
}

export function CoPilot({ onNavigateToPost, onNavigateToComment }: CoPilotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState<string>("Denke nach...");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isExpanded]);

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      toast.success("In Zwischenablage kopiert");
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  const sendMessage = useCallback(async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    console.log('[CoPilot] Button clicked, input:', inputValue);
    
    if (!inputValue.trim()) {
      toast.error('Eingabe leer');
      return;
    }
    
    if (isLoading) return;

    setIsLoading(true);
    
    // Set contextual loading hint based on user input
    const inputLower = inputValue.toLowerCase();
    if (inputLower.includes("foto") || inputLower.includes("bild") || inputLower.includes("suche")) {
      setLoadingHint("🔍 Suche passende Bilder...");
    } else if (inputLower.includes("generier") || inputLower.includes("erstell") || inputLower.includes("mach")) {
      setLoadingHint("🎨 Erstelle Entwurf...");
    } else if (inputLower.includes("kommentar") || inputLower.includes("antwort")) {
      setLoadingHint("💬 Analysiere Kommentare...");
    } else if (inputLower.includes("statistik") || inputLower.includes("zahlen") || inputLower.includes("performance")) {
      setLoadingHint("📊 Lade Statistiken...");
    } else if (inputLower.includes("post") || inputLower.includes("content")) {
      setLoadingHint("📝 Bereite Content vor...");
    } else {
      setLoadingHint("Denke nach...");
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    try {
      const messageHistory = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke("copilot-chat", {
        body: { messages: messageHistory },
      });

      if (error) {
        const errMsg = error.message || "Verbindungsfehler zur Edge Function";
        alert(`FEHLER: ${errMsg}`);
        throw new Error(errMsg);
      }

      if (data?.error && !data?.message) {
        alert(`EDGE FUNCTION FEHLER: ${data.error}`);
        throw new Error(data.error);
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.message || "Ich konnte keine Antwort generieren.",
        toolResults: data?.tool_results || [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
      if (data?.error === "rate_limit") {
        toast.warning("Rate-Limit erreicht. Warte kurz und versuche es nochmal.");
      } else if (data?.error === "payment_required") {
        toast.error("AI-Credits aufgebraucht. Bitte Konto aufladen.");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      alert(`CHAT FEHLER:\n${errorMsg}`);
      
      const isCorsOrNetworkError = 
        error instanceof TypeError && 
        (errorMsg.includes("Failed to fetch") || 
         errorMsg.includes("NetworkError") ||
         errorMsg.includes("CORS") ||
         errorMsg.includes("network"));
      
      const displayMsg = isCorsOrNetworkError 
        ? "Verbindungsfehler (CORS/Network). Prüfe Konsole."
        : errorMsg;
      
      toast.error(displayMsg);
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ ${displayMsg}. Bitte versuche es erneut.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const handleApproveDraft = async (draftId: string) => {
    try {
      const { error } = await supabase
        .from('content_plan')
        .update({ status: 'approved' })
        .eq('id', draftId);
      
      if (error) throw error;
      toast.success("Entwurf genehmigt und eingeplant!");
    } catch (err) {
      toast.error("Fehler beim Genehmigen");
    }
  };

  const renderToolResult = (result: ToolResult) => {
    const { function_name, result: data } = result;

    if (data.error) {
      return (
        <div className="flex items-center gap-2 text-destructive text-sm p-2 bg-destructive/10 rounded-lg">
          <AlertTriangle className="h-4 w-4" />
          {data.error}
        </div>
      );
    }

    switch (function_name) {
      case "plan_post":
        if (data.draft_data) {
          return (
            <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-primary font-medium">
                <Sparkles className="h-3 w-3" />
                Entwurf zur Genehmigung
              </div>
              {data.draft_data.image_url && (
                <img src={data.draft_data.image_url} alt="Entwurf" className="w-full h-40 object-cover rounded-lg" />
              )}
              <div className="bg-background/50 rounded-lg p-2">
                <p className="text-sm whitespace-pre-wrap line-clamp-4">{data.draft_data.caption}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>📅</span>
                <span>{data.draft_data.scheduled_for_formatted}</span>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" className="flex-1 text-xs" onClick={() => handleApproveDraft(data.draft_data.id)}>
                  ✅ Genehmigen
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => { setInputValue("Generiere das Bild neu mit einem anderen Stil"); inputRef.current?.focus(); }}>
                  🔄 Neu
                </Button>
              </div>
            </div>
          );
        }
        break;

      case "generate_personalized_image":
        if (data.image_url) {
          return (
            <div className="space-y-2">
              <img src={data.image_url} alt="Generiertes Bild" className="w-full rounded-lg" />
              <p className="text-xs text-muted-foreground">🎬 {data.theme} - {data.safety_note}</p>
            </div>
          );
        }
        break;

      case "analyze_best_time":
        if (data.optimal_posting_slot) {
          return (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">⏰ Optimale Zeit</span>
                <Badge variant="secondary">{data.optimal_posting_slot.formatted}</Badge>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {data.recommendations?.slice(0, 3).map((rec: string, i: number) => (
                  <p key={i}>{rec}</p>
                ))}
              </div>
            </div>
          );
        }
        break;

      case "search_posts":
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{data.total_found} Post(s) gefunden</p>
            {data.posts?.map((post: any) => (
              <PostMiniCard key={post.id} post={post} onNavigate={() => onNavigateToPost?.(post.id)} />
            ))}
          </div>
        );

      case "get_open_comments":
        return (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{data.total_open} offene Kommentare</p>
            {data.comments?.slice(0, 5).map((comment: any) => (
              <CommentMiniCard key={comment.id} comment={comment} onNavigate={() => onNavigateToComment?.(comment.id)} />
            ))}
          </div>
        );

      case "analyze_sentiment":
        return (
          <div className="space-y-3">
            {data.post && <PostMiniCard post={data.post} onNavigate={() => onNavigateToPost?.(data.post.id)} />}
            {data.sentiment_analysis && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Stimmung</span>
                  <span className="text-lg">{data.sentiment_analysis.sentiment_label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-green-500/20 rounded p-1">
                    <div className="font-bold text-green-600">{data.sentiment_analysis.breakdown.positive}</div>
                    <div className="text-muted-foreground">Positiv</div>
                  </div>
                  <div className="bg-yellow-500/20 rounded p-1">
                    <div className="font-bold text-yellow-600">{data.sentiment_analysis.breakdown.neutral}</div>
                    <div className="text-muted-foreground">Neutral</div>
                  </div>
                  <div className="bg-red-500/20 rounded p-1">
                    <div className="font-bold text-red-600">{data.sentiment_analysis.breakdown.negative}</div>
                    <div className="text-muted-foreground">Negativ</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case "draft_reply":
        return (
          <div className="space-y-2">
            {data.comment && (
              <div className="bg-muted/30 rounded-lg p-2 text-sm">
                <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
                  <User className="h-3 w-3" />
                  @{data.comment.username}
                </div>
                <p className="line-clamp-2">{data.comment.text}</p>
              </div>
            )}
            {data.draft_reply && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                <p className="text-sm font-medium mb-1">Entwurf:</p>
                <p className="text-sm">{data.draft_reply}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs h-7"
                  onClick={() => {
                    navigator.clipboard.writeText(data.draft_reply);
                    toast.success("Kopiert!");
                  }}
                >
                  Kopieren
                </Button>
              </div>
            )}
          </div>
        );
    }

    return (
      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  const renderMessageContent = (message: Message) => (
    <div
      className={cn(
        "max-w-[85%] rounded-2xl px-4 py-2 relative group",
        message.role === "user"
          ? "bg-primary text-primary-foreground rounded-br-md"
          : "bg-muted rounded-bl-md"
      )}
    >
      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      
      {/* Tool Results */}
      {message.toolResults && message.toolResults.length > 0 && (
        <div className="mt-3 space-y-2">
          {message.toolResults.map((tr, i) => (
            <div key={i}>{renderToolResult(tr)}</div>
          ))}
        </div>
      )}
      
      {/* Copy Button for Assistant Messages */}
      {message.role === "assistant" && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute -right-2 -top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity bg-background border shadow-sm"
          onClick={() => copyToClipboard(message.content, message.id)}
        >
          {copiedMessageId === message.id ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      )}
      
      <p className="text-[10px] opacity-50 mt-1">
        {message.timestamp.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );

  const chatContent = (
    <>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Antoine's Co-Pilot</h3>
          <p className="text-xs text-muted-foreground">Dein Community-Assistent</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? "Verkleinern" : "Vergrößern"}
        >
          {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setIsOpen(false);
            setIsExpanded(false);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            </div>
            <h4 className="font-medium mb-2">Hallo! Wie kann ich helfen?</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Frag mich nach Posts, Kommentaren oder lass mich Antworten entwerfen.
            </p>
            <div className="space-y-2 w-full max-w-sm">
              {[
                "Zeig mir alle offenen Kommentare von heute",
                "Wie war die Reaktion auf mein letztes Bild?",
                "Suche alle Posts über Tatort",
              ].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-auto py-2 px-3 whitespace-normal text-left justify-start"
                  onClick={() => {
                    setInputValue(suggestion);
                    inputRef.current?.focus();
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-2",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex-shrink-0 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
                {renderMessageContent(message)}
                {message.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-muted flex-shrink-0 flex items-center justify-center">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-2 justify-start">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex-shrink-0 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary-foreground animate-pulse" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="animate-pulse">{loadingHint}</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Invisible scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-muted/30">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Frag mich etwas..."
            disabled={isLoading}
            className="flex-1 bg-background"
          />
          <Button
            onClick={(e) => sendMessage(e)}
            disabled={!inputValue.trim() || isLoading}
            size="icon"
            type="button"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Floating Action Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg",
          "bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70",
          "transition-all duration-300 hover:scale-110",
          isOpen && "rotate-45"
        )}
        size="icon"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Sparkles className="h-6 w-6" />
        )}
      </Button>

      {/* Small Chat Overlay */}
      {isOpen && !isExpanded && (
        <div
          className={cn(
            "fixed bottom-24 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)]",
            "h-[600px] max-h-[calc(100vh-8rem)]",
            "bg-background/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl",
            "flex flex-col overflow-hidden",
            "animate-in slide-in-from-bottom-4 fade-in duration-300"
          )}
        >
          {chatContent}
        </div>
      )}

      {/* Expanded Modal */}
      <Dialog open={isOpen && isExpanded} onOpenChange={(open) => {
        if (!open) {
          setIsExpanded(false);
        }
      }}>
        <DialogContent className="max-w-4xl w-[90vw] h-[85vh] p-0 flex flex-col overflow-hidden">
          {chatContent}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Mini Post Card Component
function PostMiniCard({ post, onNavigate }: { post: any; onNavigate?: () => void }) {
  const instagramUrl = getInstagramUrl(post.original_ig_permalink || post.permalink);
  
  return (
    <div className="flex gap-2 bg-background rounded-lg p-2 border">
      {post.original_media_url || post.image_url ? (
        <img
          src={post.original_media_url || post.image_url}
          alt=""
          className="h-12 w-12 rounded object-cover flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
          <MessageCircle className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs line-clamp-2">{post.caption?.substring(0, 80) || "Kein Caption"}</p>
        <div className="flex items-center gap-2 mt-1">
          {post.likes_count !== undefined && (
            <span className="text-[10px] text-muted-foreground">❤️ {post.likes_count || 0}</span>
          )}
          {post.comments_count !== undefined && (
            <span className="text-[10px] text-muted-foreground">💬 {post.comments_count || 0}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {instagramUrl && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => window.open(instagramUrl, "_blank")}
            title="Auf Instagram öffnen"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

// Mini Comment Card Component
function CommentMiniCard({ comment, onNavigate }: { comment: any; onNavigate?: () => void }) {
  return (
    <div
      className={cn(
        "bg-background rounded-lg p-2 border cursor-pointer hover:bg-muted/50 transition-colors",
        comment.is_critical && "border-destructive/50"
      )}
      onClick={onNavigate}
    >
      <div className="flex items-center gap-1 text-muted-foreground text-xs mb-1">
        <User className="h-3 w-3" />
        <span>@{comment.username}</span>
        {comment.is_critical && (
          <Badge variant="destructive" className="text-[10px] h-4 px-1">
            Kritisch
          </Badge>
        )}
      </div>
      <p className="text-xs line-clamp-2">{comment.text}</p>
      {comment.post && (
        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
          <span className="line-clamp-1">📷 {comment.post.caption}</span>
        </div>
      )}
    </div>
  );
}
