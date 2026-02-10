import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  Send, 
  Loader2, 
  Copy,
  Check,
  Bot,
  User,
  MessageSquare,
  Zap
} from "lucide-react";
import { invokeFunction, apiGet } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ChatCommentCard } from "./ChatCommentCard";
import { ChatDebugPanel } from "./ChatDebugPanel";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults?: ToolResult[];
  timestamp: Date;
  interactive?: InteractiveContent;
}

interface ToolResult {
  function_name: string;
  result: any;
}

interface InteractiveContent {
  type: "comments" | "debug";
  data: any;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! 👋 Ich bin dein Instagram Co-Pilot. Frag mich nach Kommentaren, lass mich Posts erstellen oder sag einfach was du brauchst.\n\n💡 Tipp: Schreib '/debug_comments' um die Warteschlange zu prüfen.",
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState<string>("Denke nach...");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      toast.success("Kopiert!");
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      toast.error("Kopieren fehlgeschlagen");
    }
  };

  // Handle debug command
  const handleDebugCommand = async () => {
    setIsLoading(true);
    setLoadingHint("🔍 Prüfe System-Status...");

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: "/debug_comments",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    try {
      // Check queue table
      let queueData: any[] | null = null;
      let queueError: Error | null = null;
      try {
        queueData = await apiGet<any[]>("/api/community/queue-reply", { limit: "10" });
      } catch (err) {
        queueError = err instanceof Error ? err : new Error(String(err));
      }

      // Check last log entry for cron
      let logsData: any[] | null = null;
      try {
        logsData = await apiGet<any[]>("/api/logs", { event_types: "reply_queue_processed,cron_tick,scheduler_tick", limit: "5" });
      } catch {}

      // Check connection status
      let connData: any = null;
      try {
        connData = await apiGet<any>("/api/settings/meta-connection");
      } catch {}

      const debugData = {
        queue: {
          accessible: !queueError,
          error: queueError?.message,
          items: queueData || [],
          counts: {
            pending: queueData?.filter((q) => q.status === "pending").length || 0,
            waiting: queueData?.filter((q) => q.status === "waiting_for_post").length || 0,
            failed: queueData?.filter((q) => q.status === "failed").length || 0,
            sent: queueData?.filter((q) => q.status === "sent").length || 0,
          }
        },
        cron: {
          lastRun: logsData?.[0]?.created_at || null,
          recentLogs: logsData || [],
        },
        connection: {
          connected: !!connData?.ig_username,
          username: connData?.ig_username,
        }
      };

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "🔧 **Debug-Bericht:**",
        interactive: {
          type: "debug",
          data: debugData
        },
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ Debug fehlgeschlagen: ${errorMsg}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle fetching comments interactively
  const handleGetComments = async () => {
    setIsLoading(true);
    setLoadingHint("💬 Lade Kommentare...");

    try {
      const comments = await apiGet<any[]>("/api/community/comments", { is_replied: "false", limit: "5" });

      if (!comments || comments.length === 0) {
        const noCommentsMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "✅ Keine offenen Kommentare! Alles beantwortet. 🎉",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, noCommentsMessage]);
        return;
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `📬 **${comments.length} offene Kommentare:**`,
        interactive: {
          type: "comments",
          data: comments
        },
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const trimmedInput = inputValue.trim();

    // Handle special commands
    if (trimmedInput.toLowerCase() === "/debug_comments") {
      setInputValue("");
      await handleDebugCommand();
      return;
    }

    // Check for comment-related queries
    const lowerInput = trimmedInput.toLowerCase();
    if (
      lowerInput.includes("kommentar") ||
      lowerInput.includes("offene") ||
      lowerInput.includes("unbeantwortet") ||
      lowerInput.includes("neue nachrichten")
    ) {
      setInputValue("");
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmedInput,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      await handleGetComments();
      return;
    }

    setIsLoading(true);
    
    if (lowerInput.includes("foto") || lowerInput.includes("bild")) {
      setLoadingHint("🔍 Suche passende Bilder...");
    } else if (lowerInput.includes("generier") || lowerInput.includes("erstell") || lowerInput.includes("post")) {
      setLoadingHint("🎨 Erstelle Entwurf...");
    } else if (lowerInput.includes("performance") || lowerInput.includes("statistik")) {
      setLoadingHint("📊 Analysiere Daten...");
    } else {
      setLoadingHint("Denke nach...");
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");

    try {
      const messageHistory = messages
        .filter(m => m.id !== "welcome")
        .concat(userMessage)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const { data, error } = await invokeFunction("copilot-chat", {
        body: { messages: messageHistory },
      });

      if (error) throw new Error(error.message);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.message || "Ich konnte keine Antwort generieren.",
        toolResults: data?.tool_results || [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      
      if (data?.error === "rate_limit") {
        toast.warning("Rate-Limit erreicht. Warte kurz.");
      } else if (data?.error === "payment_required") {
        toast.error("AI-Credits aufgebraucht.");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(errorMsg);
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ Fehler: ${errorMsg}. Bitte versuche es erneut.`,
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
      sendMessage();
    }
  };

  const handleCommentApproved = (commentId: string) => {
    toast.success("Antwort in Warteschlange gelegt! 🚀");
    // Update the message to show it's been handled
    setMessages(prev => prev.map(msg => {
      if (msg.interactive?.type === "comments") {
        const updatedData = msg.interactive.data.filter((c: any) => c.id !== commentId);
        return {
          ...msg,
          interactive: {
            ...msg.interactive,
            data: updatedData
          }
        };
      }
      return msg;
    }));
  };

  const quickActions = [
    { label: "📬 Offene Kommentare", prompt: "Zeig mir offene Kommentare" },
    { label: "✨ Post-Idee", prompt: "Generiere eine Post-Idee" },
    { label: "📊 Performance", prompt: "Wie laufen meine Posts?" },
    { label: "🔧 Debug", prompt: "/debug_comments" },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-card/50 backdrop-blur-xl">
        <div className="flex items-center gap-4 max-w-3xl mx-auto">
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-lg shadow-primary/20">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-background flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            </div>
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-lg text-foreground">Instagram Co-Pilot</h1>
            <p className="text-sm text-muted-foreground">Dein persönlicher Assistent</p>
          </div>
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
            Online
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-6" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              
              <div className={cn(
                "flex flex-col gap-2 max-w-[85%]",
                message.role === "user" && "items-end"
              )}>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 relative group",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border rounded-bl-md"
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  
                  {/* Copy button for assistant messages */}
                  {message.role === "assistant" && message.content && message.id !== "welcome" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute -right-10 top-1 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                      onClick={() => copyToClipboard(message.content, message.id)}
                    >
                      {copiedMessageId === message.id ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  )}
                </div>

                {/* Interactive Content */}
                {message.interactive?.type === "comments" && (
                  <div className="space-y-3 w-full">
                    {message.interactive.data.map((comment: any) => (
                      <ChatCommentCard 
                        key={comment.id} 
                        comment={comment}
                        onApprove={handleCommentApproved}
                      />
                    ))}
                  </div>
                )}

                {message.interactive?.type === "debug" && (
                  <ChatDebugPanel data={message.interactive.data} />
                )}

                <span className="text-[10px] text-muted-foreground px-1">
                  {message.timestamp.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {message.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loadingHint}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Quick actions */}
      {messages.length <= 2 && (
        <div className="flex-shrink-0 px-4 pb-3 max-w-3xl mx-auto w-full">
          <p className="text-xs text-muted-foreground mb-2">Schnellstart:</p>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                className="text-xs h-8 rounded-full hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                onClick={() => {
                  setInputValue(action.prompt);
                  inputRef.current?.focus();
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 p-4 border-t border-border bg-card/50 backdrop-blur-xl">
        <form onSubmit={sendMessage} className="max-w-3xl mx-auto">
          <div className="relative flex items-center gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Schreib mir was du brauchst..."
              disabled={isLoading}
              className={cn(
                "flex-1 h-12 px-4 rounded-xl bg-background border-border",
                "focus:ring-2 focus:ring-primary/20 focus:border-primary",
                "placeholder:text-muted-foreground/70 text-base"
              )}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !inputValue.trim()}
              className={cn(
                "h-12 w-12 rounded-xl",
                "bg-primary hover:bg-primary/90",
                "disabled:opacity-50"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
