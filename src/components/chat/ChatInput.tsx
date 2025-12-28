import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Plus, ArrowUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatInputProps {
  onSend: (message: string, files?: File[]) => void;
  isLoading: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, isLoading, placeholder = "Nachricht an Co-Pilot..." }: ChatInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px"; // Reset to min height
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const imageFiles = files.filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("Bitte wähle Bilder aus (JPG, PNG, etc.)");
      return;
    }

    const urls = imageFiles.map(f => URL.createObjectURL(f));
    setSelectedFiles(prev => [...prev, ...imageFiles]);
    setPreviewUrls(prev => [...prev, ...urls]);
    toast.success(`${imageFiles.length} Bild(er) ausgewählt`);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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

  const handleSubmit = () => {
    if (isLoading) return;
    if (!inputValue.trim() && selectedFiles.length === 0) return;

    onSend(inputValue.trim(), selectedFiles.length > 0 ? selectedFiles : undefined);
    setInputValue("");
    clearSelectedFiles();
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Floating Capsule - ChatGPT Style */}
      <div className={cn(
        "fixed bottom-6 left-1/2 -translate-x-1/2",
        "lg:left-[calc(50%+7.5rem)]", // Offset by half sidebar width (15rem/2) on desktop
        "w-[95%] max-w-3xl",
        "bg-background rounded-[26px]",
        "shadow-2xl border border-border",
        "z-50 flex flex-col"
      )}>
        {/* Selected files preview - inside capsule */}
        {selectedFiles.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-4 pt-3">
            {previewUrls.map((url, idx) => (
              <div key={idx} className="relative flex-shrink-0">
                <img
                  src={url}
                  alt={`Preview ${idx + 1}`}
                  className="w-14 h-14 object-cover rounded-xl border border-border/50"
                />
                <button
                  onClick={() => removeSelectedFile(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/80 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-2 p-2">
          {/* Plus button - left side */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="h-10 w-10 rounded-full flex-shrink-0 hover:bg-muted mb-0.5 ml-1"
            disabled={isLoading}
          >
            <Plus className="h-5 w-5 text-muted-foreground" />
          </Button>

          {/* Textarea - auto-growing */}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            className={cn(
              "flex-1 min-h-[44px] max-h-[200px]",
              "bg-transparent border-none resize-none",
              "focus:outline-none focus:ring-0",
              "py-3 px-1 text-foreground",
              "placeholder:text-muted-foreground/60",
              "overflow-y-auto scrollbar-thin"
            )}
          />

          {/* Send button - right side, ChatGPT style */}
          <Button
            type="button"
            size="icon"
            onClick={handleSubmit}
            disabled={isLoading || (!inputValue.trim() && selectedFiles.length === 0)}
            className={cn(
              "h-10 w-10 rounded-full flex-shrink-0 mb-0.5 mr-1 transition-all",
              (inputValue.trim() || selectedFiles.length > 0) && !isLoading
                ? "bg-foreground hover:bg-foreground/90 text-background"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </>
  );
}
