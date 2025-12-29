import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, User, ExternalLink, Send, EyeOff, Ban, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface Comment {
  id: string;
  comment_text: string;
  commenter_username: string | null;
  comment_timestamp: string;
  ai_reply_suggestion: string | null;
  ig_comment_id: string;
  sentiment_score: number | null;
  is_critical: boolean | null;
  post?: {
    caption: string | null;
    original_ig_permalink: string | null;
  } | null;
}

interface NegativeCommentsDialogProps {
  negativeComments: Comment[];
  triggerText: string;
  replyTexts: Record<string, string>;
  onReplyTextChange: (commentId: string, text: string) => void;
  onSendReply: (comment: Comment) => void;
  onHideComment: (comment: Comment) => void;
  onBlockUser: (comment: Comment) => void;
  sendingReply: string | null;
  hidingComment: string | null;
  blockingUser: string | null;
}

export function NegativeCommentsDialog({
  negativeComments,
  triggerText,
  replyTexts,
  onReplyTextChange,
  onSendReply,
  onHideComment,
  onBlockUser,
  sendingReply,
  hidingComment,
  blockingUser,
}: NegativeCommentsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const getSentimentBadge = (score: number | null, isCritical: boolean | null) => {
    if (isCritical) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          Kritisch
        </Badge>
      );
    }
    if (score !== null && score < 0.3) {
      return (
        <Badge variant="outline" className="gap-1 border-orange-500/50 text-orange-600">
          Negativ ({Math.round(score * 100)}%)
        </Badge>
      );
    }
    return null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="text-xs text-destructive hover:text-destructive/80 transition-colors flex items-center gap-2 hover:underline cursor-pointer">
          <AlertTriangle className="h-3 w-3" />
          {triggerText}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Negative / Kritische Kommentare
          </DialogTitle>
          <DialogDescription>
            {negativeComments.length} Kommentar(e) mit negativer Stimmung oder als kritisch markiert. 
            Diese sollten besonders sorgfältig bearbeitet werden.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[65vh] pr-4">
          <div className="space-y-4">
            {negativeComments.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Keine negativen Kommentare vorhanden 🎉
              </div>
            ) : (
              negativeComments.map(comment => (
                <div
                  key={comment.id}
                  className={cn(
                    "p-4 rounded-lg border bg-card",
                    comment.is_critical 
                      ? "border-destructive/50 bg-destructive/5" 
                      : "border-orange-500/30 bg-orange-500/5"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <span className="font-medium text-sm">
                          @{comment.commenter_username || "unbekannt"}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {formatDistanceToNow(new Date(comment.comment_timestamp), {
                            locale: de,
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      {getSentimentBadge(comment.sentiment_score, comment.is_critical)}
                    </div>
                    <div className="flex items-center gap-1">
                      {comment.post?.original_ig_permalink && (
                        <a
                          href={comment.post.original_ig_permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="Auf Instagram öffnen"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Comment text */}
                  <p className="text-sm mb-3 p-2 bg-muted/50 rounded">{comment.comment_text}</p>

                  {/* Post caption preview */}
                  {comment.post?.caption && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-3 italic">
                      Post: "{comment.post.caption.slice(0, 80)}..."
                    </p>
                  )}

                  {/* Reply textarea */}
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Antwort eingeben..."
                      value={replyTexts[comment.id] || ""}
                      onChange={(e) => onReplyTextChange(comment.id, e.target.value)}
                      className="min-h-[60px] text-sm"
                    />
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => onSendReply(comment)}
                        disabled={!replyTexts[comment.id]?.trim() || sendingReply === comment.id}
                      >
                        {sendingReply === comment.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Send className="h-3 w-3 mr-1" />
                        )}
                        Antworten
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onHideComment(comment)}
                        disabled={hidingComment === comment.id}
                        className="text-muted-foreground"
                      >
                        {hidingComment === comment.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <EyeOff className="h-3 w-3 mr-1" />
                        )}
                        Ausblenden
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onBlockUser(comment)}
                        disabled={blockingUser === comment.id}
                        className="text-destructive hover:text-destructive"
                      >
                        {blockingUser === comment.id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Ban className="h-3 w-3 mr-1" />
                        )}
                        Blockieren
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
