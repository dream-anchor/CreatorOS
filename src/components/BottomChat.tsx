import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Send, 
  Loader2, 
  Bot,
  User,
  ChevronUp,
  ChevronDown,
  Zap,
  X,
  MessageCircle,
  CalendarClock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseNavigationIntent } from "@/hooks/useNavigation";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  navigatedTo?: string;
}

export function BottomChat() {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! 👋 Was steht an? Sag mir was du brauchst.",
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleAnalyzeComments = async () => {
    setIsLoading(true);
    
    try {
      // Trigger smart reply generation for all visible comments
      const { data, error } = await supabase.functions.invoke("analyze-comments");
      
      if (error) throw error;
      
      const successMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "✨ Analyse abgeschlossen! Die Smart Replies wurden generiert. Du siehst sie jetzt in der Kommentar-Liste.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, successMessage]);
      
      // Trigger a refresh on the page
      window.dispatchEvent(new CustomEvent('refresh-comments'));
      
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
    setInputValue("");
    setIsExpanded(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Handle special commands
    if (trimmedInput.toLowerCase().includes("analysiere kommentare") || 
        trimmedInput.toLowerCase().includes("smart reply")) {
      await handleAnalyzeComments();
      return;
    }

    // Check for navigation intent
    const navRoute = parseNavigationIntent(trimmedInput);
    if (navRoute) {
      navigate(navRoute);
      
      const routeNames: Record<string, string> = {
        "/dashboard": "Dashboard",
        "/community": "Community",
        "/calendar": "Planung",
        "/media": "Bilder",
        "/analytics": "Analytics",
        "/settings": "Einstellungen",
        "/generator": "Content erstellen",
        "/review": "Review",
      };

      const navMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `🚀 **${routeNames[navRoute] || navRoute}** geöffnet!`,
        navigatedTo: navRoute,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, navMessage]);
      return;
    }

    // Regular AI chat
    setIsLoading(true);

    try {
      const messageHistory = messages
        .filter(m => m.id !== "welcome")
        .concat(userMessage)
        .map(m => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke("copilot-chat", {
        body: { messages: messageHistory },
      });

      if (error) throw new Error(error.message);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.message || "Ich konnte keine Antwort generieren.",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(errorMsg);
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ Fehler: ${errorMsg}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, messages, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={cn(
      "fixed bottom-0 left-60 right-0 z-50 bg-card/98 backdrop-blur-2xl border-t border-border/50 transition-all duration-300 shadow-2xl",
      isExpanded ? "h-[50vh]" : "h-20"
    )}>
      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/50 via-accent/50 to-primary/50" />
      
      {/* Expanded Chat History */}
      {isExpanded && (
        <div className="h-[calc(100%-5rem)] flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-lg animate-pulse-slow">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-semibold">Co-Pilot</span>
                <p className="text-[10px] text-muted-foreground">Dein KI-Assistent</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              className="h-8 w-8 rounded-lg hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "rounded-2xl px-4 py-3 max-w-lg text-sm shadow-sm",
                    message.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground"
                      : "bg-muted/60 border border-border/50"
                  )}>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    
                    {message.navigatedTo && (
                      <Badge variant="outline" className="mt-2 text-[10px] bg-primary/10 border-primary/20">
                        <Zap className="h-2.5 w-2.5 mr-1" />
                        Navigiert
                      </Badge>
                    )}
                  </div>
                  
                  {message.role === "user" && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="bg-muted/60 border border-border/50 rounded-2xl px-4 py-3 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Denke nach...</span>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Input Bar - Always visible */}
      <div className="h-20 px-6 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-10 w-10 flex-shrink-0 rounded-xl hover:bg-muted"
        >
          {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
        </Button>

        <div className="flex-1 relative max-w-2xl">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-300" />
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsExpanded(true)}
              placeholder="Frag mich etwas... (z.B. 'Analysiere Kommentare', 'Zeig Planung')"
              className="relative h-12 text-base pr-14 rounded-xl bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
            />
            <Button
              size="icon"
              onClick={() => sendMessage()}
              disabled={!inputValue.trim() || isLoading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="hidden lg:flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigate("/community");
              setInputValue("");
            }}
            className="rounded-xl gap-2 h-10"
          >
            <MessageCircle className="h-4 w-4" />
            Kommentare
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigate("/calendar");
              setInputValue("");
            }}
            className="rounded-xl gap-2 h-10"
          >
            <CalendarClock className="h-4 w-4" />
            Planung
          </Button>
        </div>
      </div>
    </div>
  );
}
