import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ExternalLink,
  ChevronDown,
  ChevronUp,
  User,
  ArrowRight,
  RefreshCw,
  Calendar,
  MessageSquare,
  Image as ImageIcon,
  MoreVertical,
  Wrench,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CommentWithContext } from "./CommentCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PostGroup {
  igMediaId: string;
  postCaption: string | null;
  postPermalink: string | null;
  postShortcode?: string | null;
  publishedAt: string | null;
  postImageUrl?: string | null;
  postId?: string | null;
  comments: CommentWithContext[];
}

// Helper to extract a valid Instagram URL
function getInstagramUrl(permalink: string | null, shortcode?: string | null): string | null {
  // Priority 1: Use permalink if it's a valid Instagram URL
  if (permalink && /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+/.test(permalink)) {
    return permalink;
  }
  
  // Priority 2: Build URL from shortcode if available
  if (shortcode && /^[A-Za-z0-9_-]+$/.test(shortcode)) {
    return `https://www.instagram.com/p/${shortcode}/`;
  }
  
  // FORBIDDEN: Never use internal IDs, media_id, or numeric values
  // Return null to disable the button
  return null;
}

interface PostCardProps {
  group: PostGroup;
  onToggleSelect: (id: string) => void;
  onUpdateReply: (id: string, text: string) => void;
  onApproveAll: (igMediaId: string) => void;
  sanitizingComments: Set<string>;
  onMetadataRepaired?: () => void;
}

export function PostCard({
  group,
  onToggleSelect,
  onUpdateReply,
  onApproveAll,
  sanitizingComments,
  onMetadataRepaired,
}: PostCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showFullCaption, setShowFullCaption] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);

  const handleRepairMetadata = async () => {
    setIsRepairing(true);
    try {
      const { data, error } = await supabase.functions.invoke("repair-post-metadata", {
        body: {
          ig_media_id: group.igMediaId,
          post_id: group.postId,
        },
      });

      if (error) {
        // Try to parse error message for more details
        let errorMessage = error.message;
        try {
          const parsed = JSON.parse(error.message);
          errorMessage = parsed.error || parsed.message || error.message;
        } catch {
          // Keep original message
        }
        throw new Error(errorMessage);
      }

      if (data?.success) {
        toast.success("✅ Metadaten erfolgreich repariert!", {
          description: data.data?.permalink 
            ? `Neuer Link: ${data.data.permalink.substring(0, 40)}...`
            : "Daten wurden aktualisiert",
        });
        // Trigger a refresh of the parent component
        onMetadataRepaired?.();
      } else {
        // Show detailed error from API response
        const errorMsg = data?.error || data?.message || "Unbekannter Fehler";
        throw new Error(errorMsg);
      }
    } catch (err) {
      console.error("Repair error:", err);
      const message = err instanceof Error ? err.message : "Bitte später erneut versuchen";
      toast.error(`❌ Reparatur fehlgeschlagen`, {
        description: message,
        duration: 8000,
      });
    } finally {
      setIsRepairing(false);
    }
  };

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

  // Get post image from first comment if available
  const postImage = group.postImageUrl || group.comments[0]?.post_image_url;

  return (
    <div className="rounded-2xl bg-white dark:bg-card border border-gray-200 dark:border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* ===== POST HEADER ===== */}
      <div className="p-5 bg-gray-50/80 dark:bg-secondary/60 border-b border-gray-100 dark:border-border">
        <div className="flex items-start gap-4">
          {/* Left: Thumbnail */}
          <div className="w-16 h-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden border border-border/50">
            {postImage ? (
              <img
                src={postImage}
                alt="Post"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
              </div>
            )}
          </div>

          {/* Middle: Caption */}
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm leading-relaxed text-foreground line-clamp-2">
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
            
            {/* Meta info */}
            <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
              {group.publishedAt && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {format(new Date(group.publishedAt), "dd.MM.yyyy", { locale: de })}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3" />
                <span>
                  {totalCount} Kommentar{totalCount !== 1 ? "e" : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {(() => {
              const instagramUrl = getInstagramUrl(group.postPermalink, group.postShortcode);
              
              if (instagramUrl) {
                return (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => window.open(instagramUrl, "_blank", "noopener,noreferrer")}
                    title={`Original ansehen: ${instagramUrl}`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                );
              }
              
              // No valid URL available - show disabled button
              return (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground/40 cursor-not-allowed"
                  disabled
                  title="Link nicht verfügbar – kein gültiger Instagram-Permalink vorhanden"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              );
            })()}

            {/* Repair Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  disabled={isRepairing}
                >
                  {isRepairing ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <MoreVertical className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={handleRepairMetadata}
                  disabled={isRepairing}
                  className="cursor-pointer"
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  Metadaten neu synchronisieren
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <div className="flex items-center gap-2 pl-3 border-l border-border/50">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Alle</span>
              <Switch
                checked={allSelected}
                onCheckedChange={handleBulkToggle}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>
        </div>

        {selectedCount > 0 && selectedCount < totalCount && (
          <Badge
            variant="secondary"
            className="mt-3 text-xs bg-primary/10 text-primary border-0"
          >
            {selectedCount}/{totalCount} ausgewählt
          </Badge>
        )}
      </div>

      {/* ===== COMMENTS SECTION ===== */}
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors">
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Kommentare ausblenden
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                {totalCount} Kommentare anzeigen
              </>
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-5 space-y-4 bg-white dark:bg-card">
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
      className={`rounded-lg p-4 transition-all ${
        isSanitizing 
          ? "opacity-60 bg-muted/30" 
          : comment.selected 
            ? "bg-secondary/80 dark:bg-secondary/60 ring-1 ring-primary/20" 
            : "bg-muted/40 dark:bg-muted/20"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Left: Avatar + User Info */}
        <div className="flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-muted dark:bg-muted/50 flex items-center justify-center border border-border/30">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* Middle: Content */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* User name + timestamp */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-foreground">
              @{comment.commenter_username || "Unbekannt"}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(comment.comment_timestamp), "dd.MM. HH:mm", { locale: de })}
            </span>
          </div>

          {/* Fan comment text */}
          <p className="text-sm text-foreground leading-relaxed">
            {comment.comment_text}
          </p>

          {/* AI Reply Section */}
          <div className="flex items-start gap-2">
            <ArrowRight className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              {isSanitizing ? (
                <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
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
                  className="text-sm min-h-[60px] bg-background border-accent/30 focus:border-accent"
                />
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full text-left py-2 px-3 rounded-md bg-accent/10 hover:bg-accent/15 transition-colors text-sm text-accent leading-relaxed"
                >
                  {comment.editedReply || (
                    <span className="italic text-muted-foreground">
                      Antwort eingeben...
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Toggle */}
        <div className="flex-shrink-0 pt-1">
          <Switch
            checked={comment.selected}
            onCheckedChange={() => onToggleSelect(comment.id)}
            disabled={isSanitizing}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      </div>
    </div>
  );
}
