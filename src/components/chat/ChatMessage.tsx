import { Bot, User, Calendar, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
}

export function ChatMessage({ role, content, images, navigatedTo, uploadResult }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex gap-4 py-6", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        isUser 
          ? "bg-primary/20" 
          : "bg-gradient-to-br from-primary/20 to-accent/20"
      )}>
        {isUser ? (
          <User className="h-4 w-4 text-primary" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>

      {/* Message Content */}
      <div className={cn(
        "flex-1 max-w-[75%] space-y-2",
        isUser ? "flex flex-col items-end" : ""
      )}>
        {/* Image Previews */}
        {images && images.length > 0 && (
          <div className={cn("flex gap-2 flex-wrap", isUser ? "justify-end" : "")}>
            {images.map((url, idx) => (
              <img
                key={idx}
                src={url}
                alt={`Upload ${idx + 1}`}
                className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-xl border border-border/50"
              />
            ))}
          </div>
        )}

        {/* Text Content */}
        <div className={cn(
          "rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 border border-border/50 text-foreground"
        )}>
          <p className="whitespace-pre-wrap">{content}</p>

          {/* Navigation Badge */}
          {navigatedTo && (
            <Badge variant="outline" className="mt-2 text-[10px] bg-primary/10 border-primary/20">
              <Zap className="h-2.5 w-2.5 mr-1" />
              Navigiert
            </Badge>
          )}

          {/* Upload Result Link */}
          {uploadResult && (
            <Link
              to="/calendar"
              className="mt-3 flex items-center gap-2 text-xs text-primary hover:underline"
            >
              <Calendar className="h-3.5 w-3.5" />
              Zur Vorschau im Kalender
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
