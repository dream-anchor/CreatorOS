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
import { EyeOff, User, X, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface Comment {
  id: string;
  comment_text: string;
  commenter_username: string | null;
  comment_timestamp: string;
  post?: {
    caption: string | null;
    original_ig_permalink: string | null;
  } | null;
}

interface BlacklistTopic {
  id: string;
  topic: string;
}

interface FilteredCommentsDialogProps {
  filteredComments: Comment[];
  blacklistTopics: BlacklistTopic[];
  onRemoveBlacklistTopic: (id: string) => void;
  triggerText: string;
}

export function FilteredCommentsDialog({
  filteredComments,
  blacklistTopics,
  onRemoveBlacklistTopic,
  triggerText,
}: FilteredCommentsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Find which topic caused each comment to be filtered
  const getMatchedTopics = (comment: Comment): BlacklistTopic[] => {
    const caption = comment.post?.caption?.toLowerCase() || "";
    return blacklistTopics.filter(topic => 
      caption.includes(topic.topic.toLowerCase())
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2 hover:underline cursor-pointer">
          <EyeOff className="h-3 w-3" />
          {triggerText}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <EyeOff className="h-5 w-5" />
            Ausgeblendete Kommentare
          </DialogTitle>
          <DialogDescription>
            {filteredComments.length} Kommentar(e) werden durch Themen-Filter ausgeblendet
          </DialogDescription>
        </DialogHeader>

        {/* Active Blacklist Topics */}
        <div className="flex flex-wrap gap-2 py-2 border-b border-border">
          <span className="text-sm text-muted-foreground">Aktive Filter:</span>
          {blacklistTopics.map(topic => (
            <Badge 
              key={topic.id} 
              variant="secondary"
              className="gap-1 pr-1"
            >
              {topic.topic}
              <Button
                size="icon"
                variant="ghost"
                className="h-4 w-4 hover:bg-destructive/20"
                onClick={() => onRemoveBlacklistTopic(topic.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>

        {/* Filtered Comments List */}
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-3">
            {filteredComments.map(comment => {
              const matchedTopics = getMatchedTopics(comment);
              return (
                <div
                  key={comment.id}
                  className="p-3 rounded-lg border border-border bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
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
                    </div>
                    {comment.post?.original_ig_permalink && (
                      <a
                        href={comment.post.original_ig_permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>

                  <p className="text-sm mb-2">{comment.comment_text}</p>

                  {/* Post caption preview */}
                  {comment.post?.caption && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2 italic">
                      Post: "{comment.post.caption.slice(0, 100)}..."
                    </p>
                  )}

                  {/* Matched topics */}
                  <div className="flex flex-wrap gap-1">
                    {matchedTopics.map(topic => (
                      <Badge 
                        key={topic.id} 
                        variant="outline"
                        className="text-xs gap-1 border-amber-500/50 text-amber-600"
                      >
                        <EyeOff className="h-2.5 w-2.5" />
                        {topic.topic}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-3.5 w-3.5 hover:bg-destructive/20 ml-0.5"
                          onClick={() => onRemoveBlacklistTopic(topic.id)}
                          title="Filter entfernen"
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
