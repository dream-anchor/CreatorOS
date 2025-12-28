import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Check, Edit2, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface CoPilotCommentCardProps {
  comment: {
    id: string;
    comment_text: string;
    commenter_username: string | null;
    comment_timestamp: string;
    ai_reply_suggestion: string | null;
    ig_comment_id: string;
  };
  onApprove: (commentId: string) => void;
}

export function CoPilotCommentCard({ comment, onApprove }: CoPilotCommentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedReply, setEditedReply] = useState(comment.ai_reply_suggestion || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async (replyText: string) => {
    if (!replyText.trim()) {
      toast.error("Bitte gib eine Antwort ein");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("comment_reply_queue").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        ig_comment_id: comment.ig_comment_id,
        comment_id: comment.id,
        reply_text: replyText.trim(),
        status: "pending",
      });

      if (error) throw error;

      await supabase
        .from("instagram_comments")
        .update({ is_replied: true, ai_reply_suggestion: replyText.trim() })
        .eq("id", comment.id);

      onApprove(comment.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      toast.error(`Fehler: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const timeAgo = formatDistanceToNow(new Date(comment.comment_timestamp), {
    addSuffix: true,
    locale: de
  });

  return (
    <Card className="p-3 bg-card/90 border-border/50 text-sm">
      <div className="flex items-start gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
          {comment.commenter_username?.[0]?.toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-xs">@{comment.commenter_username || "?"}</span>
            <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
          </div>
          <p className="text-xs text-foreground/90 mt-0.5 line-clamp-2">{comment.comment_text}</p>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            value={editedReply}
            onChange={(e) => setEditedReply(e.target.value)}
            className="min-h-[60px] text-xs resize-none"
            placeholder="Deine Antwort..."
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => handleApprove(editedReply)}
              disabled={isSubmitting}
              className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
              Senden
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)} className="h-7 w-7 p-0">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="bg-muted/50 rounded p-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">✨ Vorschlag:</p>
            <p className="text-xs line-clamp-2">{editedReply || "Keine Antwort"}</p>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => handleApprove(editedReply || comment.ai_reply_suggestion || "")}
              disabled={isSubmitting || !editedReply && !comment.ai_reply_suggestion}
              className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
              OK
            </Button>
            <Button size="sm" variant="outline" onClick={() => setIsEditing(true)} className="h-7 w-7 p-0">
              <Edit2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
