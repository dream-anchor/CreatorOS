import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  Bot,
  User,
  Zap,
  X,
  Calendar
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseNavigationIntent } from "@/hooks/useNavigation";
import { ChatInput } from "@/components/chat/ChatInput";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  navigatedTo?: string;
  images?: string[]; // Preview URLs for uploaded images
  uploadResult?: {
    type: "image" | "carousel";
    scheduledDate: string;
    scheduledDay: string;
    postId: string;
  };
}

export function BottomChat() {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! 👋 Was steht an? Lade Bilder hoch und ich plane sie automatisch ein.",
      timestamp: new Date(),
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState("Denke nach...");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleSmartUpload = async (files: File[], rawText: string) => {
    if (files.length === 0) return;

    setIsLoading(true);
    setLoadingHint("📤 Lade Bilder hoch...");
    setIsExpanded(true);

    // Create preview URLs for user message
    const previewUrls = files.map(f => URL.createObjectURL(f));

    // Show user message with image previews
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: rawText || `${files.length} Bild(er) hochgeladen`,
      timestamp: new Date(),
      images: previewUrls,
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      // Convert files to base64 for upload
      const fileDataPromises = files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        return {
          name: file.name,
          type: file.type,
          base64: base64,
        };
      });

      const fileData = await Promise.all(fileDataPromises);

      setLoadingHint("🎨 Analysiere Bilder & erstelle Text...");

      const { data, error } = await supabase.functions.invoke("process-smart-upload", {
        body: {
          files: fileData,
          rawText: rawText,
        },
      });

      if (error) throw new Error(error.message);

      if (!data?.success) {
        throw new Error(data?.error || "Upload fehlgeschlagen");
      }

      // Create success message
      const formatLabel = data.format === "carousel" ? "Karussell" : "Bild";
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `📸 Upload verarbeitet als **${formatLabel}**.\n📝 Text optimiert.\n📅 Automatisch eingeplant für **${data.scheduledDay}**, den **${data.scheduledDate}** um 18:00 Uhr (nächste freie Lücke).`,
        timestamp: new Date(),
        uploadResult: {
          type: data.format,
          scheduledDate: data.scheduledDate,
          scheduledDay: data.scheduledDay,
          postId: data.postId,
        },
      };

      setMessages(prev => [...prev, assistantMessage]);
      toast.success("Post eingeplant! 🎉");

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
  };

  const handleAnalyzeComments = async () => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("analyze-comments");
      
      if (error) throw error;
      
      const successMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "✨ Analyse abgeschlossen! Die Smart Replies wurden generiert. Du siehst sie jetzt in der Kommentar-Liste.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, successMessage]);
      
      window.dispatchEvent(new CustomEvent('refresh-comments'));
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = useCallback(async (message: string, files?: File[]) => {
    // If files are provided, do smart upload
    if (files && files.length > 0) {
      await handleSmartUpload(files, message);
      return;
    }

    if (!message.trim() || isLoading) return;

    setIsExpanded(true);

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Handle special commands
    if (message.toLowerCase().includes("analysiere kommentare") || 
        message.toLowerCase().includes("smart reply")) {
      await handleAnalyzeComments();
      return;
    }

    // Check for navigation intent
    const navRoute = parseNavigationIntent(message);
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
  }, [isLoading, messages, navigate]);

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 lg:left-60 z-50 bg-card/98 backdrop-blur-2xl border-t border-border/50 transition-all duration-300 shadow-2xl",
      isExpanded ? "h-[60vh] sm:h-[50vh]" : "h-auto"
    )}>
      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/50 via-accent/50 to-primary/50" />
      
      {/* Expanded Chat History */}
      {isExpanded && (
        <div className="h-[calc(100%-6rem)] flex flex-col">
          <div className="flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3 border-b border-border/30">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-lg animate-pulse-slow">
                <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-semibold">Co-Pilot</span>
                <p className="text-[9px] sm:text-[10px] text-muted-foreground">Dein KI-Assistent</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(false)}
              className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <ScrollArea className="flex-1 px-4 sm:px-6 py-3 sm:py-4">
            <div className="space-y-3 sm:space-y-4 max-w-3xl mx-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-2 sm:gap-3",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "rounded-2xl px-3 py-2 sm:px-4 sm:py-3 max-w-[75%] sm:max-w-lg text-xs sm:text-sm shadow-sm",
                    message.role === "user"
                      ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground"
                      : "bg-muted/60 border border-border/50"
                  )}>
                    {/* Image previews for user messages */}
                    {message.images && message.images.length > 0 && (
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {message.images.map((url, idx) => (
                          <img 
                            key={idx}
                            src={url}
                            alt={`Upload ${idx + 1}`}
                            className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg"
                          />
                        ))}
                      </div>
                    )}
                    
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    
                    {message.navigatedTo && (
                      <Badge variant="outline" className="mt-2 text-[9px] sm:text-[10px] bg-primary/10 border-primary/20">
                        <Zap className="h-2.5 w-2.5 mr-1" />
                        Navigiert
                      </Badge>
                    )}

                    {/* Upload result with preview link */}
                    {message.uploadResult && (
                      <Link
                        to="/calendar"
                        className="mt-2 flex items-center gap-2 text-xs text-primary hover:underline"
                      >
                        <Calendar className="h-3 w-3" />
                        Zur Vorschau im Kalender
                      </Link>
                    )}
                  </div>
                  
                  {message.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-primary/20 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex gap-2 sm:gap-3">
                  <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                    <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  </div>
                  <div className="bg-muted/60 border border-border/50 rounded-2xl px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-primary" />
                    <span className="text-xs sm:text-sm text-muted-foreground">{loadingHint}</span>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ChatInput - ChatGPT Style floating input */}
      <div onClick={() => !isExpanded && setIsExpanded(true)}>
        <ChatInput
          onSend={handleSend}
          isLoading={isLoading}
          placeholder="Nachricht an Co-Pilot..."
        />
      </div>
    </div>
  );
}
