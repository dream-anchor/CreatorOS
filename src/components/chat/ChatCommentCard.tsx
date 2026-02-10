import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Check, Edit2, Loader2, RefreshCw, X } from "lucide-react";
import { apiPost, invokeFunction } from "@/lib/api";
import { getUser } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface ChatCommentCardProps {
  comment: {
    id: string;
    comment_text: string;
    commenter_username: string | null;
    comment_timestamp: string;
    ai_reply_suggestion: string | null;
    ig_comment_id: string;
    posts?: {
      caption: string | null;
      original_media_url: string | null;
    } | null;
  };
  onApprove: (commentId: string) => void;
}

export function ChatCommentCard({ comment, onApprove }: ChatCommentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedReply, setEditedReply] = useState(comment.ai_reply_suggestion || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleApprove = async (replyText: string) => {
    if (!replyText.trim()) {
      toast.error("Bitte gib eine Antwort ein");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = getUser();
      await apiPost("/api/community/queue-reply", {
        user_id: user?.id,
        ig_comment_id: comment.ig_comment_id,
        comment_id: comment.id,
        reply_text: replyText.trim(),
        status: "pending",
      });

      onApprove(comment.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`Fehler: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const { data, error } = await invokeFunction("regenerate-reply", {
        body: { commentId: comment.id }
      });

      if (error) throw error;

      if (data?.suggestion) {
        setEditedReply(data.suggestion);
        toast.success("Neue Antwort generiert!");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`Regenerierung fehlgeschlagen: ${errorMsg}`);
    } finally {
      setIsRegenerating(false);
    }
  };

  const timeAgo = formatDistanceToNow(new Date(comment.comment_timestamp), {
    addSuffix: true,
    locale: de
  });

  return (
    <Card className="p-4 bg-card/80 border-border/50 hover:border-primary/30 transition-colors">
      {/* Comment header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
          {comment.commenter_username?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-foreground">
              @{comment.commenter_username || "Unbekannt"}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
          </div>
          <p className="text-sm text-foreground/90 mt-1">{comment.comment_text}</p>
        </div>
      </div>

      {/* AI Reply suggestion */}
      <div className="bg-muted/50 rounded-lg p-3 mb-3">
        <p className="text-xs text-muted-foreground mb-1">✨ Vorgeschlagene Antwort:</p>
        {isEditing ? (
          <Textarea
            value={editedReply}
            onChange={(e) => setEditedReply(e.target.value)}
            className="min-h-[80px] text-sm resize-none"
            placeholder="Deine Antwort..."
          />
        ) : (
          <p className="text-sm text-foreground">
            {editedReply || comment.ai_reply_suggestion || "Keine Antwort generiert"}
          </p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {isEditing ? (
          <>
            <Button
              size="sm"
              onClick={() => handleApprove(editedReply)}
              disabled={isSubmitting}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Absenden
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setEditedReply(comment.ai_reply_suggestion || "");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => handleApprove(editedReply || comment.ai_reply_suggestion || "")}
              disabled={isSubmitting || !editedReply && !comment.ai_reply_suggestion}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              Genehmigen
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(true)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
