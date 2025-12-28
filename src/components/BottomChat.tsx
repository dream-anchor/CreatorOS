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
  CalendarClock,
  Paperclip,
  Image as ImageIcon,
  Calendar
} from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
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
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState("Denke nach...");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Filter for images only
    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("Bitte wähle Bilder aus (JPG, PNG, etc.)");
      return;
    }

    // Create preview URLs
    const urls = imageFiles.map(f => URL.createObjectURL(f));
    
    setSelectedFiles(prev => [...prev, ...imageFiles]);
    setPreviewUrls(prev => [...prev, ...urls]);
    setIsExpanded(true);
    
    toast.success(`${imageFiles.length} Bild(er) ausgewählt`);
  };

  const removeSelectedFile = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const clearSelectedFiles = () => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setSelectedFiles([]);
    setPreviewUrls([]);
  };

  const handleSmartUpload = async () => {
    if (selectedFiles.length === 0) return;

    setIsLoading(true);
    setLoadingHint("📤 Lade Bilder hoch...");
    setIsExpanded(true);

    // Show user message with image previews
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue.trim() || `${selectedFiles.length} Bild(er) hochgeladen`,
      timestamp: new Date(),
      images: [...previewUrls],
    };
    setMessages(prev => [...prev, userMessage]);

    const rawText = inputValue.trim();
    setInputValue("");

    try {
      // Convert files to base64 for upload
      const fileDataPromises = selectedFiles.map(async (file) => {
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
      clearSelectedFiles();
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

  const sendMessage = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // If files are selected, do smart upload
    if (selectedFiles.length > 0) {
      await handleSmartUpload();
      return;
    }

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
  }, [inputValue, isLoading, messages, navigate, selectedFiles]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 lg:left-60 z-50 bg-card/98 backdrop-blur-2xl border-t border-border/50 transition-all duration-300 shadow-2xl",
      isExpanded ? "h-[60vh] sm:h-[50vh]" : "h-16 sm:h-20"
    )}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/50 via-accent/50 to-primary/50" />
      
      {/* Expanded Chat History */}
      {isExpanded && (
        <div className="h-[calc(100%-4rem)] sm:h-[calc(100%-5rem)] flex flex-col">
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

      {/* Selected files preview bar */}
      {selectedFiles.length > 0 && (
        <div className="absolute bottom-16 sm:bottom-20 left-0 right-0 bg-muted/95 backdrop-blur-xl border-t border-border/50 px-4 py-2">
          <div className="flex items-center gap-2 max-w-2xl mx-auto">
            <div className="flex gap-2 flex-1 overflow-x-auto">
              {previewUrls.map((url, idx) => (
                <div key={idx} className="relative flex-shrink-0">
                  <img 
                    src={url} 
                    alt={`Preview ${idx + 1}`}
                    className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg border border-border"
                  />
                  <button
                    onClick={() => removeSelectedFile(idx)}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <Badge variant="secondary" className="flex-shrink-0">
              <ImageIcon className="h-3 w-3 mr-1" />
              {selectedFiles.length}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelectedFiles}
              className="flex-shrink-0 text-xs"
            >
              Alle entfernen
            </Button>
          </div>
        </div>
      )}

      {/* Input Bar - Always visible */}
      <div className="h-16 sm:h-20 px-3 sm:px-6 flex items-center gap-2 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 rounded-xl hover:bg-muted"
        >
          {isExpanded ? <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" /> : <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5" />}
        </Button>

        {/* Paperclip upload button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 rounded-xl hover:bg-muted"
          title="Bilder hochladen"
        >
          <Paperclip className="h-4 w-4 sm:h-5 sm:w-5" />
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
              placeholder={selectedFiles.length > 0 ? "Optionaler Text zum Post..." : "Frag mich etwas..."}
              className="relative h-10 sm:h-12 text-sm sm:text-base pr-12 sm:pr-14 rounded-xl bg-muted/50 border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              disabled={isLoading}
            />
            <Button
              size="icon"
              onClick={() => sendMessage()}
              disabled={(selectedFiles.length === 0 && !inputValue.trim()) || isLoading}
              className="absolute right-1 sm:right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 sm:h-9 sm:w-9 rounded-lg"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Quick Actions - Hidden on mobile */}
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
