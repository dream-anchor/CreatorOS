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
    <div className="w-full">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Input container - ChatGPT style pill */}
      <div className={cn(
        "relative flex items-end gap-1 p-1.5 rounded-3xl border",
        "bg-muted/50 border-border/50",
        "focus-within:border-border transition-all"
      )}>
        {/* Plus button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className="h-9 w-9 rounded-full flex-shrink-0 hover:bg-background/80"
          disabled={isLoading}
        >
          <Plus className="h-5 w-5 text-muted-foreground" />
        </Button>

        {/* Selected files preview - inline */}
        {selectedFiles.length > 0 && (
          <div className="flex items-center gap-1.5 py-1">
            {previewUrls.map((url, idx) => (
              <div key={idx} className="relative flex-shrink-0">
                <img
                  src={url}
                  alt={`Preview ${idx + 1}`}
                  className="w-10 h-10 object-cover rounded-lg"
                />
                <button
                  onClick={() => removeSelectedFile(idx)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className={cn(
            "flex-1 min-h-[36px] max-h-[200px] resize-none",
            "bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
            "text-sm placeholder:text-muted-foreground/60 py-2 px-1"
          )}
          rows={1}
        />

        {/* Send button */}
        <Button
          type="button"
          size="icon"
          onClick={handleSubmit}
          disabled={isLoading || (!inputValue.trim() && selectedFiles.length === 0)}
          className={cn(
            "h-9 w-9 rounded-full flex-shrink-0 transition-all",
            (inputValue.trim() || selectedFiles.length > 0) && !isLoading
              ? "bg-foreground hover:bg-foreground/90 text-background"
              : "bg-muted text-muted-foreground"
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
