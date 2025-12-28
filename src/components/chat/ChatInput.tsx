import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
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
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full flex justify-center px-4 pb-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Floating input container - ChatGPT style */}
      <div className={cn(
        "relative flex items-end gap-2 p-2 w-full max-w-3xl",
        "rounded-2xl border border-border/50 bg-background",
        "shadow-lg shadow-black/5",
        "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30",
        "transition-all duration-200"
      )}>
        {/* Plus button - left side */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className="h-9 w-9 rounded-full flex-shrink-0 hover:bg-muted self-end"
          disabled={isLoading}
        >
          <Plus className="h-5 w-5 text-muted-foreground" />
        </Button>

        {/* Middle section: files + textarea */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Selected files preview */}
          {selectedFiles.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              {previewUrls.map((url, idx) => (
                <div key={idx} className="relative flex-shrink-0">
                  <img
                    src={url}
                    alt={`Preview ${idx + 1}`}
                    className="w-12 h-12 object-cover rounded-lg border border-border/50"
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

          {/* Textarea - auto-growing */}
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className={cn(
              "min-h-[40px] max-h-[200px] resize-none",
              "bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
              "text-sm placeholder:text-muted-foreground/60 py-2.5 px-1",
              "scrollbar-thin"
            )}
            rows={1}
          />
        </div>

        {/* Send button - right side, aligned to bottom */}
        <Button
          type="button"
          size="icon"
          onClick={handleSubmit}
          disabled={isLoading || (!inputValue.trim() && selectedFiles.length === 0)}
          className={cn(
            "h-9 w-9 rounded-full flex-shrink-0 transition-all self-end",
            (inputValue.trim() || selectedFiles.length > 0) && !isLoading
              ? "bg-primary hover:bg-primary/90 text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
