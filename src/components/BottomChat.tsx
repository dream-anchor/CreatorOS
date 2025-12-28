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
  X
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
      "fixed bottom-0 left-56 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border transition-all duration-300",
      isExpanded ? "h-96" : "h-16"
    )}>
      {/* Expanded Chat History */}
      {isExpanded && (
        <div className="h-[calc(100%-4rem)] flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center">
                <Bot className="h-3 w-3 text-white" />
              </div>
              <span className="text-sm font-medium">Co-Pilot Chat</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              className="h-7 w-7"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <ScrollArea className="flex-1 px-4 py-3">
            <div className="space-y-3 max-w-4xl mx-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-2",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "rounded-xl px-3 py-2 max-w-xl text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/80"
                  )}>
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    
                    {message.navigatedTo && (
                      <Badge variant="outline" className="mt-1 text-[10px] bg-primary/10 border-primary/20">
                        <Zap className="h-2 w-2 mr-1" />
                        Navigiert
                      </Badge>
                    )}
                  </div>
                  
                  {message.role === "user" && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
                      <User className="h-3 w-3 text-primary" />
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <div className="bg-muted/80 rounded-xl px-3 py-2 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-xs text-muted-foreground">Denke nach...</span>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Input Bar - Always visible */}
      <div className="h-16 px-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-9 w-9 flex-shrink-0"
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>

        <div className="flex-1 relative max-w-3xl mx-auto">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsExpanded(true)}
            placeholder="Frag mich etwas... (z.B. 'Analysiere Kommentare', 'Zeig Planung')"
            className="pr-12 bg-muted/50 border-border/50 focus:border-primary/50"
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={() => sendMessage()}
            disabled={!inputValue.trim() || isLoading}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Quick Actions */}
        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigate("/community");
              setInputValue("");
            }}
            className="text-xs"
          >
            💬 Kommentare
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigate("/calendar");
              setInputValue("");
            }}
            className="text-xs"
          >
            📅 Planung
          </Button>
        </div>
      </div>
    </div>
  );
}
