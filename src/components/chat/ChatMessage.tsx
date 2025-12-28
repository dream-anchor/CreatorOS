import { Calendar, Copy, ThumbsUp, ThumbsDown, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  navigatedTo?: string;
  uploadResult?: {
    type: "image" | "carousel";
    scheduledDate: string;
    scheduledDay: string;
    postId: string;
  };
  onRegenerate?: () => void;
}

export function ChatMessage({ role, content, images, navigatedTo, uploadResult, onRegenerate }: ChatMessageProps) {
  const isUser = role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    toast.success("Kopiert!");
  };

  return (
    <div className={cn("py-4", isUser ? "flex justify-end" : "")}>
      {/* User Message - Compact pill, right aligned */}
      {isUser ? (
        <div className="max-w-[85%] space-y-2">
          {/* Image Previews */}
          {images && images.length > 0 && (
            <div className="flex gap-2 flex-wrap justify-end">
              {images.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt={`Upload ${idx + 1}`}
                  className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-2xl"
                />
              ))}
            </div>
          )}
          <div className="bg-muted rounded-3xl px-4 py-2.5 text-sm inline-block ml-auto">
            <p className="whitespace-pre-wrap">{content}</p>
          </div>
        </div>
      ) : (
        /* Assistant Message - Left aligned, no background */
        <div className="max-w-[85%] space-y-3">
          <div className="text-sm leading-relaxed text-foreground">
            <p className="whitespace-pre-wrap">{content}</p>

            {/* Upload Result Link */}
            {uploadResult && (
              <Link
                to="/calendar"
                className="mt-3 inline-flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <Calendar className="h-3.5 w-3.5" />
                Zur Vorschau im Kalender
              </Link>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
            {onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onRegenerate}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
