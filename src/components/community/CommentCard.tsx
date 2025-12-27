import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ImageWithFallback } from "./ImageWithFallback";
import { Sparkles, ExternalLink, CheckCircle2, User, RefreshCw, Clock, AlertCircle } from "lucide-react";
import { getInstagramUrl } from "@/lib/instagram-utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export interface CommentWithContext {
  id: string;
  ig_comment_id: string;
  ig_media_id: string;
  commenter_username: string | null;
  comment_text: string;
  comment_timestamp: string;
  is_replied: boolean;
  is_hidden: boolean;
  is_critical: boolean;
  sentiment_score: number | null;
  ai_reply_suggestion: string | null;
  post_id: string | null;
  // Joined post data
  post_caption?: string | null;
  post_image_url?: string | null;
  post_permalink?: string | null;
  post_published_at?: string | null;
  // UI state
  selected?: boolean;
  editedReply?: string;
  approved?: boolean;
}

interface CommentCardProps {
  comment: CommentWithContext;
  onToggleSelect: (id: string) => void;
  onUpdateReply: (id: string, text: string) => void;
  onApprove: (id: string) => void;
  isSanitizing?: boolean;
  queueStatus?: "pending" | "waiting" | "failed" | null;
  scheduledFor?: string | null;
}

export function CommentCard({
  comment,
  onToggleSelect,
  onUpdateReply,
  onApprove,
  isSanitizing = false,
  queueStatus = null,
  scheduledFor = null,
}: CommentCardProps) {
  const truncatedCaption = comment.post_caption
    ? comment.post_caption.slice(0, 50) + (comment.post_caption.length > 50 ? '...' : '')
    : 'Kein Caption';

  return (
    <div className={`p-4 bg-muted/30 rounded-lg border ${isSanitizing ? 'opacity-70' : ''} ${queueStatus ? 'border-primary/30 bg-primary/5' : ''}`}>
      <div className="flex gap-4">
        {/* Left: Checkbox + Comment */}
        <div className="flex items-start gap-3 flex-1">
          <Checkbox
            checked={comment.selected}
            onCheckedChange={() => onToggleSelect(comment.id)}
            className="mt-1"
            disabled={isSanitizing}
          />
          <div className="flex-1 space-y-2">
            {/* Commenter info */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <span className="font-medium text-sm">@{comment.commenter_username || 'Unbekannt'}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {format(new Date(comment.comment_timestamp), 'dd.MM.yyyy HH:mm', { locale: de })}
                </span>
              </div>
              {comment.sentiment_score !== null && comment.sentiment_score > 0.5 && (
                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600">
                  Positiv
                </Badge>
              )}
              {comment.approved && (
                <Badge className="text-xs bg-primary/10 text-primary">
                  ✅ Freigegeben
                </Badge>
              )}
              {isSanitizing && (
                <Badge variant="outline" className="text-xs gap-1 animate-pulse">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Korrigiere Emoji-Stil...
                </Badge>
              )}
              {queueStatus === "pending" && (
                <Badge variant="outline" className="text-xs gap-1 bg-amber-500/10 text-amber-600 border-amber-300">
                  <Clock className="h-3 w-3" />
                  In Warteschlange
                  {scheduledFor && (
                    <span className="ml-1">
                      ({format(new Date(scheduledFor), "HH:mm", { locale: de })})
                    </span>
                  )}
                </Badge>
              )}
              {queueStatus === "waiting" && (
                <Badge variant="outline" className="text-xs gap-1 bg-blue-500/10 text-blue-600 border-blue-300">
                  <Clock className="h-3 w-3" />
                  Wartet auf Post
                </Badge>
              )}
              {queueStatus === "failed" && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Fehlgeschlagen
                </Badge>
              )}
            </div>
            
            {/* Comment text */}
            <p className="text-sm">{comment.comment_text}</p>
            
            <Separator className="my-2" />
            
            {/* Reply suggestion */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Antwort-Vorschlag
              </label>
              {isSanitizing ? (
                <div className="h-16 bg-muted rounded-md flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Generiere neue Antwort...
                </div>
              ) : (
                <Textarea
                  value={comment.editedReply || ''}
                  onChange={(e) => onUpdateReply(comment.id, e.target.value)}
                  placeholder="Antwort eingeben..."
                  rows={2}
                  className="text-sm"
                />
              )}
              
              {/* Approve button */}
              {!isSanitizing && !comment.approved && comment.editedReply && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => onApprove(comment.id)}
                  className="gap-1"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  ✅ Freigeben
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Post context */}
        <div className="w-32 flex-shrink-0 space-y-2">
          <ImageWithFallback
            src={comment.post_image_url}
            alt="Original Post"
            postId={comment.post_id || undefined}
            igMediaId={comment.ig_media_id}
            className="w-full h-24 rounded-md object-cover"
          />
          <p className="text-xs text-muted-foreground line-clamp-2">
            {truncatedCaption}
          </p>
          {(() => {
            const safeUrl = getInstagramUrl(comment.post_permalink);
            if (!safeUrl) return null;
            return (
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs h-7 gap-1"
                onClick={() => window.open(safeUrl, '_blank', 'noopener,noreferrer')}
                title={`Öffnen: ${safeUrl}`}
              >
                <ExternalLink className="h-3 w-3" />
                Original ansehen
              </Button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
