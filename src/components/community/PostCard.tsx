import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  User,
  ArrowRight,
  RefreshCw,
  Calendar,
  MessageSquare,
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

interface PostCardProps {
  group: PostGroup;
  onToggleSelect: (id: string) => void;
  onUpdateReply: (id: string, text: string) => void;
  onApproveAll: (igMediaId: string) => void;
  sanitizingComments: Set<string>;
}

export function PostCard({
  group,
  onToggleSelect,
  onUpdateReply,
  onApproveAll,
  sanitizingComments,
}: PostCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFullCaption, setShowFullCaption] = useState(false);

  const selectedCount = group.comments.filter((c) => c.selected).length;
  const totalCount = group.comments.length;
  const allSelected = selectedCount === totalCount;

  // Truncate caption to ~2 lines (roughly 120 chars)
  const maxCaptionLength = 120;
  const needsTruncation =
    group.postCaption && group.postCaption.length > maxCaptionLength;
  const displayCaption =
    showFullCaption || !needsTruncation
      ? group.postCaption
      : group.postCaption?.slice(0, maxCaptionLength) + "...";

  const handleBulkToggle = () => {
    onApproveAll(group.igMediaId);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 overflow-hidden shadow-sm">
      {/* Post Header */}
      <div className="p-5 bg-muted/30 border-b border-border/40">
        <div className="flex items-start justify-between gap-4">
          {/* Caption */}
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm leading-relaxed text-foreground/90">
              {displayCaption || (
                <span className="text-muted-foreground italic">Kein Caption</span>
              )}
            </p>
            {needsTruncation && (
              <button
                onClick={() => setShowFullCaption(!showFullCaption)}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                {showFullCaption ? "Weniger" : "Mehr anzeigen"}
              </button>
            )}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {/* Original Post Link - only show if we have a valid Instagram permalink */}
            {group.postPermalink && group.postPermalink.includes("instagram.com") ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => window.open(group.postPermalink!, "_blank", "noopener,noreferrer")}
              >
                Original Post
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground/50 italic">
                Link nicht verfügbar
              </span>
            )}

            {/* Bulk Toggle */}
            <div className="flex items-center gap-3 pl-4 border-l border-border/40">
              <span className="text-xs text-muted-foreground">
                Alle freigeben
              </span>
              <Switch
                checked={allSelected}
                onCheckedChange={handleBulkToggle}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          {group.publishedAt && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {format(new Date(group.publishedAt), "dd.MM.yyyy HH:mm", {
                  locale: de,
                })}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>
              {totalCount} Kommentar{totalCount !== 1 ? "e" : ""}
            </span>
          </div>
          {selectedCount > 0 && (
            <Badge
              variant="secondary"
              className="text-xs bg-primary/10 text-primary border-0"
            >
              {selectedCount} ausgewählt
            </Badge>
          )}
        </div>
      </div>

      {/* Comments Section */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors border-b border-border/30">
            <span>
              {isExpanded
                ? "Kommentare ausblenden"
                : `${totalCount} Kommentare anzeigen`}
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="divide-y divide-border/30">
            {group.comments.map((comment) => {
              const isSanitizing = sanitizingComments.has(comment.id);

              return (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  isSanitizing={isSanitizing}
                  onToggleSelect={onToggleSelect}
                  onUpdateReply={onUpdateReply}
                />
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

interface CommentRowProps {
  comment: CommentWithContext;
  isSanitizing: boolean;
  onToggleSelect: (id: string) => void;
  onUpdateReply: (id: string, text: string) => void;
}

function CommentRow({
  comment,
  isSanitizing,
  onToggleSelect,
  onUpdateReply,
}: CommentRowProps) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div
      className={`grid grid-cols-[1fr,auto,1.2fr,auto] gap-4 p-4 items-start ${
        isSanitizing ? "opacity-60" : ""
      } ${!comment.selected ? "bg-muted/20" : "hover:bg-muted/10"} transition-colors`}
    >
      {/* Column 1: User & Comment */}
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
            <User className="h-3 w-3 text-muted-foreground" />
          </div>
          <span className="font-medium text-sm truncate">
            @{comment.commenter_username || "Unbekannt"}
          </span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {format(new Date(comment.comment_timestamp), "dd.MM. HH:mm", {
              locale: de,
            })}
          </span>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed pl-8">
          {comment.comment_text}
        </p>
      </div>

      {/* Column 2: Arrow */}
      <div className="flex items-center justify-center pt-1">
        <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
      </div>

      {/* Column 3: AI Reply */}
      <div className="min-w-0">
        {isSanitizing ? (
          <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span>Generiere neue Antwort...</span>
          </div>
        ) : isEditing ? (
          <Textarea
            value={comment.editedReply || ""}
            onChange={(e) => onUpdateReply(comment.id, e.target.value)}
            onBlur={() => setIsEditing(false)}
            autoFocus
            rows={2}
            className="text-sm min-h-[60px] bg-background"
          />
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="w-full text-left p-2.5 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors text-sm text-primary/90 leading-relaxed"
          >
            {comment.editedReply || (
              <span className="italic text-muted-foreground">
                Antwort eingeben...
              </span>
            )}
          </button>
        )}
      </div>

      {/* Column 4: Toggle */}
      <div className="flex items-start pt-1">
        <Switch
          checked={comment.selected}
          onCheckedChange={() => onToggleSelect(comment.id)}
          disabled={isSanitizing}
          className="data-[state=checked]:bg-primary"
        />
      </div>
    </div>
  );
}
