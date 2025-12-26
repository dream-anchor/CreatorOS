import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ExternalLink, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  User, 
  RefreshCw,
  Sparkles,
  Calendar,
  MessageSquare
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CommentWithContext } from "./CommentCard";

interface PostGroup {
  igMediaId: string;
  postCaption: string | null;
  postPermalink: string | null;
  publishedAt: string | null;
  comments: CommentWithContext[];
}

interface PostCommentGroupProps {
  group: PostGroup;
  onToggleSelect: (id: string) => void;
  onUpdateReply: (id: string, text: string) => void;
  onApprove: (id: string) => void;
  onApproveAll: (igMediaId: string) => void;
  sanitizingComments: Set<string>;
}

export function PostCommentGroup({
  group,
  onToggleSelect,
  onUpdateReply,
  onApprove,
  onApproveAll,
  sanitizingComments,
}: PostCommentGroupProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFullCaption, setShowFullCaption] = useState(false);

  const approvedCount = group.comments.filter(c => c.approved).length;
  const totalCount = group.comments.length;
  const allApproved = approvedCount === totalCount;

  // Truncate caption to ~3 lines (roughly 200 chars)
  const maxCaptionLength = 200;
  const needsTruncation = group.postCaption && group.postCaption.length > maxCaptionLength;
  const displayCaption = showFullCaption || !needsTruncation
    ? group.postCaption
    : group.postCaption?.slice(0, maxCaptionLength) + '...';

  return (
    <Card className="overflow-hidden">
      {/* Post Header - Text Only Context */}
      <CardHeader className="pb-3 bg-muted/30 border-b">
        <div className="space-y-2">
          {/* Meta info row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {group.publishedAt && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{format(new Date(group.publishedAt), 'dd.MM.yyyy HH:mm', { locale: de })}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>{totalCount} Kommentar{totalCount !== 1 ? 'e' : ''}</span>
              </div>
              {approvedCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {approvedCount}/{totalCount} freigegeben
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {group.postPermalink && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1"
                  onClick={() => window.open(group.postPermalink!, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" />
                  Auf Instagram ansehen
                </Button>
              )}
            </div>
          </div>

          {/* Caption - expandable */}
          <div className="space-y-1">
            <p className="text-sm leading-relaxed">
              {displayCaption || <span className="text-muted-foreground italic">Kein Caption</span>}
            </p>
            {needsTruncation && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowFullCaption(!showFullCaption)}
              >
                {showFullCaption ? 'Weniger anzeigen' : 'Mehr anzeigen'}
              </Button>
            )}
          </div>

          {/* Approve All Button */}
          <div className="pt-2">
            <Button
              size="sm"
              variant={allApproved ? "secondary" : "default"}
              onClick={() => onApproveAll(group.igMediaId)}
              disabled={allApproved}
              className="gap-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              {allApproved ? 'Alle freigegeben' : `Alle für diesen Post freigeben (${totalCount})`}
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* Comments List */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <Button 
            variant="ghost" 
            className="w-full justify-between rounded-none h-8 text-xs text-muted-foreground hover:bg-muted/50"
          >
            <span>Kommentare {isExpanded ? 'ausblenden' : 'anzeigen'}</span>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="p-0">
            {group.comments.map((comment, idx) => {
              const isSanitizing = sanitizingComments.has(comment.id);
              
              return (
                <div 
                  key={comment.id} 
                  className={`p-4 ${idx > 0 ? 'border-t' : ''} ${isSanitizing ? 'opacity-70' : ''}`}
                >
                  <div className="flex gap-3">
                    {/* Checkbox */}
                    <Checkbox
                      checked={comment.selected}
                      onCheckedChange={() => onToggleSelect(comment.id)}
                      className="mt-1"
                      disabled={isSanitizing}
                    />

                    {/* Comment content */}
                    <div className="flex-1 space-y-3">
                      {/* Commenter info */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <span className="font-medium text-sm">@{comment.commenter_username || 'Unbekannt'}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(comment.comment_timestamp), 'dd.MM. HH:mm', { locale: de })}
                        </span>
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
                      </div>

                      {/* Comment text */}
                      <p className="text-sm bg-muted/50 p-2 rounded-md">{comment.comment_text}</p>

                      {/* Reply suggestion */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          Antwort-Vorschlag
                        </label>
                        {isSanitizing ? (
                          <div className="h-14 bg-muted rounded-md flex items-center justify-center gap-2 text-sm text-muted-foreground">
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

                        {/* Approve single button */}
                        {!isSanitizing && !comment.approved && comment.editedReply && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onApprove(comment.id)}
                            className="gap-1"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Freigeben
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
