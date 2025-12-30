import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { parseNavigationIntent } from "@/hooks/useNavigation";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatConversations, useChatMessages, ChatMessage as DbChatMessage } from "@/hooks/useChatConversations";

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

// Extract image URLs from tool results
function extractImagesFromToolResults(toolResults: any[]): string[] {
  const images: string[] = [];
  
  if (!Array.isArray(toolResults)) return images;
  
  for (const tr of toolResults) {
    const result = tr.result;
    if (!result) continue;
    
    // Check for public_url in various formats
    if (result.public_url) {
      images.push(result.public_url);
    }
    if (result.image_url) {
      images.push(result.image_url);
    }
    if (result.generatedImageUrl) {
      images.push(result.generatedImageUrl);
    }
  }
  
  return images;
}

// Convert DB message to local message format
function dbToLocalMessage(dbMsg: DbChatMessage): Message {
  return {
    id: dbMsg.id,
    role: dbMsg.role,
    content: dbMsg.content || "",
    timestamp: new Date(dbMsg.created_at),
    images: dbMsg.attachments?.images || [],
  };
}

export function ModernChatInterface() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get("chat");
  
  const { createConversation } = useChatConversations();
  const { messages: dbMessages, addMessage, loading: messagesLoading } = useChatMessages(conversationId);
  
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState("Denke nach...");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync DB messages to local state when conversation changes
  useEffect(() => {
    if (dbMessages.length > 0) {
      setLocalMessages(dbMessages.map(dbToLocalMessage));
    } else if (!conversationId) {
      setLocalMessages([]);
    }
  }, [dbMessages, conversationId]);

  const hasMessages = localMessages.length > 0;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [localMessages, isLoading, scrollToBottom]);

  // Ensure we have a conversation before saving messages
  const ensureConversation = useCallback(async (firstMessage: string): Promise<string | null> => {
    if (conversationId) return conversationId;
    
    // Create new conversation with first few words as title
    const title = firstMessage.slice(0, 50) + (firstMessage.length > 50 ? "..." : "");
    const newId = await createConversation(title);
    
    if (newId) {
      setSearchParams({ chat: newId });
      return newId;
    }
    return null;
  }, [conversationId, createConversation, setSearchParams]);

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
    setLocalMessages(prev => [...prev, userMessage]);

    try {
      // Ensure conversation exists
      const convId = await ensureConversation(userMessage.content);
      if (convId) {
        await addMessage("user", userMessage.content, { images: previewUrls });
      }

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

      setLocalMessages(prev => [...prev, assistantMessage]);
      
      // Save to DB
      if (convId) {
        await addMessage("assistant", assistantMessage.content);
      }
      
      toast.success("Post eingeplant!");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(errorMsg);
      const errMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Fehler: ${errorMsg}`,
        timestamp: new Date(),
      };
      setLocalMessages(prev => [...prev, errMessage]);
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
    setLocalMessages(prev => [...prev, userMessage]);

    // Only check navigation for short messages (guard against long AI prompts)
    const trimmed = message.trim();
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    
    if (wordCount <= 5) {
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
        setLocalMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `${routeNames[navRoute] || navRoute} geöffnet!`,
          navigatedTo: navRoute,
          timestamp: new Date(),
        }]);
        return;
      }
    }

    // Regular AI chat
    setIsLoading(true);
    setLoadingHint("Denke nach...");

    try {
      // Ensure conversation exists
      const convId = await ensureConversation(message);
      if (convId) {
        await addMessage("user", message);
      }

      const messageHistory = localMessages
        .concat(userMessage)
        .map(m => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke("copilot-chat", {
        body: { messages: messageHistory },
      });

      if (error) throw new Error(error.message);

      // Extract images from tool results
      const toolImages = extractImagesFromToolResults(data?.tool_results || []);
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data?.message || "Ich konnte keine Antwort generieren.",
        timestamp: new Date(),
        images: toolImages.length > 0 ? toolImages : undefined,
      };
      
      setLocalMessages(prev => [...prev, assistantMessage]);
      
      // Save to DB with images
      if (convId) {
        await addMessage("assistant", assistantMessage.content, {
          images: toolImages,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(errorMsg);
      setLocalMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Fehler: ${errorMsg}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [localMessages, navigate, ensureConversation, addMessage]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header - Minimal like ChatGPT */}
      <div className="flex items-center justify-center py-3 border-b border-border/30">
        <span className="text-sm font-medium text-foreground">Co-Pilot</span>
      </div>

      {/* Loading state for conversation */}
      {messagesLoading && conversationId ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : hasMessages ? (
        /* Messages view */
        <>
          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto px-4 py-4">
              {localMessages.map((message) => (
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
