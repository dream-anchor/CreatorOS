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
  ChevronLeft,
  ChevronRight,
  Settings,
  ImageIcon,
  CalendarClock,
  BarChart3,
  MessageCircle,
  Home,
  Zap
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { parseNavigationIntent } from "@/hooks/useNavigation";
import { CoPilotCommentCard } from "./CoPilotCommentCard";
import { CoPilotDebugPanel } from "./CoPilotDebugPanel";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolResults?: any[];
  timestamp: Date;
  interactive?: InteractiveContent;
  navigatedTo?: string;
}

interface InteractiveContent {
  type: "comments" | "debug";
  data: any;
}

interface CoPilotSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const navItems = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Community", href: "/community", icon: MessageCircle },
  { name: "Planung", href: "/calendar", icon: CalendarClock },
  { name: "Bilder", href: "/media", icon: ImageIcon },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function CoPilotSidebar({ collapsed, onToggleCollapse }: CoPilotSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! 👋 Ich bin dein Co-Pilot. Sag mir einfach was du brauchst - ich navigiere dich dorthin und helfe dir dabei.\n\n💡 Beispiele:\n• \"Zeig mir Kommentare\"\n• \"Öffne die Planung\"\n• \"/debug_comments\"",
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState("Denke nach...");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
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

  // Handle debug command
  const handleDebugCommand = async () => {
    setIsLoading(true);
    setLoadingHint("🔍 Prüfe System-Status...");

    try {
      const { data: queueData, error: queueError } = await supabase
        .from("comment_reply_queue")
        .select("id, status, scheduled_for, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      const { data: logsData } = await supabase
        .from("logs")
        .select("id, event_type, created_at, details")
        .in("event_type", ["reply_queue_processed", "cron_tick", "scheduler_tick"])
        .order("created_at", { ascending: false })
        .limit(5);

      const { data: connData } = await supabase
        .from("meta_connections")
        .select("ig_username, connected_at")
        .maybeSingle();

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
        interactive: { type: "debug", data: debugData },
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

    // Navigate to community page
    navigate("/community");

    try {
      const { data: comments, error } = await supabase
        .from("instagram_comments")
        .select(`
          id,
          comment_text,
          commenter_username,
          comment_timestamp,
          ai_reply_suggestion,
          is_replied,
          ig_comment_id
        `)
        .eq("is_replied", false)
        .order("comment_timestamp", { ascending: false })
        .limit(5);

      if (error) throw error;

      if (!comments || comments.length === 0) {
        const noCommentsMessage: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "✅ Keine offenen Kommentare! Ich hab dich zur Community-Seite navigiert. Dort kannst du mit 'Force Sync' neue laden.",
          navigatedTo: "/community",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, noCommentsMessage]);
        return;
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `📬 **${comments.length} offene Kommentare** - Ich hab die Community-Seite geöffnet:`,
        interactive: { type: "comments", data: comments },
        navigatedTo: "/community",
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
    setInputValue("");

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedInput,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Handle debug command
    if (trimmedInput.toLowerCase() === "/debug_comments") {
      await handleDebugCommand();
      return;
    }

    // Only check navigation for short messages (guard against long AI prompts)
    const wordCount = trimmedInput.split(/\s+/).filter(Boolean).length;
    
    if (wordCount <= 5) {
      const navRoute = parseNavigationIntent(trimmedInput);
      if (navRoute) {
        navigate(navRoute);
        
        // If navigating to community, also fetch comments
        if (navRoute === "/community") {
          await handleGetComments();
          return;
        }

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
          content: `🚀 Ich hab **${routeNames[navRoute] || navRoute}** für dich geöffnet!`,
          navigatedTo: navRoute,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, navMessage]);
        return;
      }
    }

    // Regular AI chat
    setIsLoading(true);
    const lowerInput = trimmedInput.toLowerCase();
    
    if (lowerInput.includes("foto") || lowerInput.includes("bild")) {
      setLoadingHint("🔍 Suche passende Bilder...");
    } else if (lowerInput.includes("generier") || lowerInput.includes("erstell") || lowerInput.includes("post")) {
      setLoadingHint("🎨 Erstelle Entwurf...");
    } else if (lowerInput.includes("performance") || lowerInput.includes("statistik")) {
      setLoadingHint("📊 Analysiere Daten...");
    } else {
      setLoadingHint("Denke nach...");
    }

    try {
      const messageHistory = messages
        .filter(m => m.id !== "welcome")
        .concat(userMessage)
        .map((m) => ({ role: m.role, content: m.content }));

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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(errorMsg);
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ Fehler: ${errorMsg}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
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

  const handleCommentApproved = (commentId: string) => {
    toast.success("Antwort in Warteschlange! 🚀");
    setMessages(prev => prev.map(msg => {
      if (msg.interactive?.type === "comments") {
        return {
          ...msg,
          interactive: {
            ...msg.interactive,
            data: msg.interactive.data.filter((c: any) => c.id !== commentId)
          }
        };
      }
      return msg;
    }));
  };

  const isActive = (href: string) => location.pathname === href;

  if (collapsed) {
    return (
      <aside className="fixed right-0 top-0 z-40 h-screen w-16 bg-card/95 backdrop-blur-xl border-l border-border flex flex-col">
        {/* Logo */}
        <div className="h-16 flex items-center justify-center border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
        </div>

        {/* Nav Icons */}
        <nav className="flex-1 py-4 flex flex-col items-center gap-2">
          {navItems.map((item) => (
            <Tooltip key={item.name} delayDuration={0}>
              <TooltipTrigger asChild>
                <Link
                  to={item.href}
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                    isActive(item.href)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="left">{item.name}</TooltipContent>
            </Tooltip>
          ))}
        </nav>

        {/* Expand button */}
        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="w-10 h-10 rounded-xl"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="fixed right-0 top-0 z-40 h-screen w-80 lg:w-96 bg-card/95 backdrop-blur-xl border-l border-border flex flex-col">
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-lg shadow-primary/20">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
          </div>
          <div>
            <h2 className="font-bold text-foreground">Co-Pilot</h2>
            <p className="text-[10px] text-muted-foreground">Steuerzentrale</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick Nav */}
      <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
        <div className="flex gap-1 overflow-x-auto scrollbar-none">
          {navItems.slice(0, 5).map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                isActive(item.href)
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-4">
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
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              
              <div className={cn(
                "flex flex-col gap-2 max-w-[85%]",
                message.role === "user" && "items-end"
              )}>
                <div
                  className={cn(
                    "rounded-xl px-3 py-2 relative group text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted/80 rounded-bl-sm"
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  
                  {message.navigatedTo && (
                    <Badge variant="outline" className="mt-2 text-[10px] bg-primary/10 border-primary/20">
                      <Zap className="h-2.5 w-2.5 mr-1" />
                      Navigiert
                    </Badge>
                  )}
                  
                  {message.role === "assistant" && message.id !== "welcome" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
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
                  <div className="space-y-2 w-full">
                    {message.interactive.data.slice(0, 3).map((comment: any) => (
                      <CoPilotCommentCard 
                        key={comment.id} 
                        comment={comment}
                        onApprove={handleCommentApproved}
                      />
                    ))}
                    {message.interactive.data.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center">
                        +{message.interactive.data.length - 3} weitere auf der Community-Seite
                      </p>
                    )}
                  </div>
                )}

                {message.interactive?.type === "debug" && (
                  <CoPilotDebugPanel data={message.interactive.data} />
                )}
              </div>

              {message.role === "user" && (
                <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2 justify-start">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-muted/80 rounded-xl rounded-bl-sm px-3 py-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {loadingHint}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border bg-muted/30">
        <form onSubmit={sendMessage}>
          <div className="relative flex items-center gap-2">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Sag mir was du brauchst..."
              disabled={isLoading}
              className="flex-1 h-10 px-3 rounded-xl bg-background border-border text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isLoading || !inputValue.trim()}
              className="h-10 w-10 rounded-xl bg-primary hover:bg-primary/90"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </aside>
  );
}
