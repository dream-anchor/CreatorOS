import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseNavigationIntent } from "@/hooks/useNavigation";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState("Denke nach...");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleSmartUpload = async (rawText: string, files: File[], previewUrls: string[]) => {
    setIsLoading(true);
    setLoadingHint("Lade Bilder hoch...");

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
      setLoadingHint("Analysiere Bilder & erstelle Text...");

      const { data, error } = await supabase.functions.invoke("process-smart-upload", {
        body: { files: fileData, rawText },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Upload fehlgeschlagen");

      const formatLabel = data.format === "carousel" ? "Karussell" : "Bild";
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Upload verarbeitet als ${formatLabel}.\nText optimiert.\nAutomatisch eingeplant für ${data.scheduledDay}, den ${data.scheduledDate} um 18:00 Uhr.`,
        timestamp: new Date(),
        uploadResult: {
          type: data.format,
          scheduledDate: data.scheduledDate,
          scheduledDay: data.scheduledDay,
          postId: data.postId,
        },
      };

      setMessages(prev => [...prev, assistantMessage]);
      toast.success("Post eingeplant!");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(errorMsg);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Fehler: ${errorMsg}`,
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
        content: `${routeNames[navRoute] || navRoute} geöffnet!`,
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
        content: `Fehler: ${errorMsg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, navigate]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header - Minimal like ChatGPT */}
      <div className="flex items-center justify-center py-3 border-b border-border/30">
        <span className="text-sm font-medium text-foreground">Co-Pilot</span>
      </div>

      {/* Chat Area */}
      {hasMessages ? (
        /* Messages view */
        <>
          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto px-4 py-4">
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
                <div className="py-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{loadingHint}</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input - Sticky bottom */}
          <div className="border-t border-border/30 bg-background">
            <div className="max-w-3xl mx-auto px-4 py-4">
              <ChatInput onSend={handleSend} isLoading={isLoading} />
            </div>
          </div>
        </>
      ) : (
        /* Empty state - Centered input like ChatGPT */
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-foreground mb-2">Was kann ich für dich tun?</h2>
            <p className="text-sm text-muted-foreground">
              Lade Bilder hoch oder stell mir eine Frage
            </p>
          </div>
          <div className="w-full max-w-2xl">
            <ChatInput onSend={handleSend} isLoading={isLoading} />
          </div>
        </div>
      )}
    </div>
  );
}
