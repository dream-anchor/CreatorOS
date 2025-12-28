import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseNavigationIntent } from "@/hooks/useNavigation";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  navigatedTo?: string;
  images?: string[];
  uploadResult?: {
    type: "image" | "carousel";
    scheduledDate: string;
    scheduledDay: string;
    postId: string;
  };
}

export function ModernChatInterface() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! 👋 Was steht an? Lade Bilder hoch und ich plane sie automatisch ein, oder stell mir eine Frage.",
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

  const handleSmartUpload = async (rawText: string, files: File[], previewUrls: string[]) => {
    setIsLoading(true);
    setLoadingHint("📤 Lade Bilder hoch...");

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: rawText || `${files.length} Bild(er) hochgeladen`,
      timestamp: new Date(),
      images: previewUrls,
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const fileDataPromises = files.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        return { name: file.name, type: file.type, base64 };
      });

      const fileData = await Promise.all(fileDataPromises);
      setLoadingHint("🎨 Analysiere Bilder & erstelle Text...");

      const { data, error } = await supabase.functions.invoke("process-smart-upload", {
        body: { files: fileData, rawText },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Upload fehlgeschlagen");

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
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ Fehler: ${errorMsg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = useCallback(async (message: string, files?: File[]) => {
    // Smart upload if files are provided
    if (files && files.length > 0) {
      const previewUrls = files.map(f => URL.createObjectURL(f));
      await handleSmartUpload(message, files, previewUrls);
      return;
    }

    if (!message.trim()) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

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
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `🚀 **${routeNames[navRoute] || navRoute}** geöffnet!`,
        navigatedTo: navRoute,
        timestamp: new Date(),
      }]);
      return;
    }

    // Regular AI chat
    setIsLoading(true);
    setLoadingHint("Denke nach...");

    try {
      const messageHistory = messages
        .filter(m => m.id !== "welcome")
        .concat(userMessage)
        .map(m => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke("copilot-chat", {
        body: { messages: messageHistory },
      });

      if (error) throw new Error(error.message);

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.message || "Ich konnte keine Antwort generieren.",
        timestamp: new Date(),
      }]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(errorMsg);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `❌ Fehler: ${errorMsg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, navigate]);

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border/30">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-lg">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-foreground">Co-Pilot</h1>
          <p className="text-xs text-muted-foreground">Dein KI-Assistent für Content & Planung</p>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 px-4">
        <div className="py-4">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              images={message.images}
              navigatedTo={message.navigatedTo}
              uploadResult={message.uploadResult}
            />
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-4 py-6">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-muted/50 border border-border/50">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">{loadingHint}</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area - Sticky at bottom */}
      <div className="sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-4 pb-6 px-4">
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}
