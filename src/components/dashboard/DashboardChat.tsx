import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { 
  Sparkles, 
  Send, 
  Loader2, 
  Copy,
  Check,
  MessageCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

interface DashboardChatProps {
  className?: string;
  expanded?: boolean;
}

export function DashboardChat({ className, expanded = false }: DashboardChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! Ich bin dein Co-Pilot. Frag mich alles über deine Posts, Kommentare oder lass mich Content für dich erstellen. 🚀",
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

  const sendMessage = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    setIsLoading(true);
    
    const inputLower = inputValue.toLowerCase();
    if (inputLower.includes("foto") || inputLower.includes("bild")) {
      setLoadingHint("🔍 Suche passende Bilder...");
    } else if (inputLower.includes("generier") || inputLower.includes("erstell")) {
      setLoadingHint("🎨 Erstelle Entwurf...");
    } else if (inputLower.includes("kommentar") || inputLower.includes("antwort")) {
      setLoadingHint("💬 Analysiere Kommentare...");
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
      const messageHistory = messages
        .filter(m => m.id !== "welcome")
        .concat(userMessage)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const { data, error } = await supabase.functions.invoke("copilot-chat", {
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

  const quickActions = [
    { label: "📬 Offene Kommentare", prompt: "Zeig mir offene Kommentare" },
    { label: "✨ Post-Idee", prompt: "Generiere eine Post-Idee für heute" },
    { label: "📊 Performance", prompt: "Wie laufen meine letzten Posts?" },
  ];

  return (
    <Card className={cn(
      "flex flex-col border-primary/20 bg-gradient-to-b from-card to-card/50",
      className
    )}>
      <CardHeader className="pb-3 border-b border-border/50 bg-gradient-to-r from-primary/5 to-cyan-500/5">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-foreground">Co-Pilot</h3>
            <p className="text-xs text-muted-foreground">Deine Steuerzentrale</p>
          </div>
          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
            Online
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 relative group",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted/80 rounded-bl-md"
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
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted/80 rounded-2xl rounded-bl-md px-4 py-3">
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
          <div className="px-4 pb-3">
            <p className="text-xs text-muted-foreground mb-2">Schnellaktionen:</p>
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

        {/* Input with prominent styling */}
        <form onSubmit={sendMessage} className="p-4 pt-2 border-t border-border/50 bg-muted/30">
          <div className="relative">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Frag mich etwas..."
              disabled={isLoading}
              className={cn(
                "pr-12 rounded-xl bg-background border-border/50",
                "focus:ring-2 focus:ring-primary/20 focus:border-primary",
                "placeholder:text-muted-foreground/70"
              )}
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !inputValue.trim()}
              className={cn(
                "absolute right-1 top-1/2 -translate-y-1/2",
                "rounded-lg h-8 w-8",
                "bg-primary hover:bg-primary/90",
                "disabled:opacity-50"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}