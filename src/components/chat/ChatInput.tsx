import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Paperclip, ArrowUp, X, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

      {/* Selected files preview */}
      {selectedFiles.length > 0 && (
        <div className="mb-3 p-3 bg-muted/30 rounded-xl border border-border/50">
          <div className="flex items-center gap-3 overflow-x-auto">
            {previewUrls.map((url, idx) => (
              <div key={idx} className="relative flex-shrink-0">
                <img
                  src={url}
                  alt={`Preview ${idx + 1}`}
                  className="w-16 h-16 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={() => removeSelectedFile(idx)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Badge variant="secondary" className="flex-shrink-0">
              <ImageIcon className="h-3 w-3 mr-1" />
              {selectedFiles.length}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSelectedFiles}
              className="flex-shrink-0 text-xs h-8"
            >
              Alle entfernen
            </Button>
          </div>
        </div>
      )}

      {/* Input container */}
      <div className={cn(
        "relative flex items-end gap-2 p-2 rounded-2xl border",
        "bg-muted/30 border-border/50",
        "focus-within:border-primary/50 focus-within:bg-muted/50 transition-all"
      )}>
        {/* Paperclip button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          className="h-10 w-10 rounded-xl flex-shrink-0 hover:bg-muted"
          disabled={isLoading}
        >
          <Paperclip className="h-5 w-5 text-muted-foreground" />
        </Button>

        {/* Textarea */}
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className={cn(
            "flex-1 min-h-[44px] max-h-[200px] resize-none",
            "bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
            "text-sm placeholder:text-muted-foreground/70 py-3 px-1"
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
            "h-10 w-10 rounded-xl flex-shrink-0 transition-all",
            (inputValue.trim() || selectedFiles.length > 0) && !isLoading
              ? "bg-primary hover:bg-primary/90 text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      </div>

      {/* Hint text */}
      <p className="text-center text-[11px] text-muted-foreground/60 mt-2">
        <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Enter</kbd> zum Senden · <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px]">Shift+Enter</kbd> für neue Zeile
      </p>
    </div>
  );
}
