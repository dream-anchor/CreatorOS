import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp,
  Heart,
  MessageCircle,
  Bookmark,
  BarChart3,
  ExternalLink,
  ImageOff,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Post } from "@/types/database";
import { toast } from "sonner";

// Import centralized Instagram URL utilities
import { getInstagramUrl, extractShortcode } from "@/lib/instagram-utils";

interface PostCardProps {
  post: Post;
  viralityScore: number;
  isUnicorn: boolean;
  isHighEngagement: boolean;
  isDiscussionStarter: boolean;
  onImageRefreshed?: (postId: string, newUrl: string) => void;
}

export function PostCard({
  post,
  viralityScore,
  isUnicorn,
  isHighEngagement,
  isDiscussionStarter,
  onImageRefreshed,
}: PostCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [localImageUrl, setLocalImageUrl] = useState(post.original_media_url);
  const [refreshAttempted, setRefreshAttempted] = useState(false);

  // Check if URL is stale (older than 3 days based on updated_at)
  const isUrlStale = () => {
    if (!post.updated_at) return false;
    const daysSinceUpdate = differenceInDays(new Date(), new Date(post.updated_at));
    return daysSinceUpdate > 3;
  };

  // Manual refresh function
  const handleManualRefresh = async () => {
    if (!post.ig_media_id || refreshing) return;
    
    setRefreshing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Nicht angemeldet");
        return;
      }

      const { data, error } = await supabase.functions.invoke('refresh-media-url', {
        body: {
          post_id: post.id,
          ig_media_id: post.ig_media_id,
        },
      });

      if (error) throw error;

      if (data?.success && data?.media_url) {
        setLocalImageUrl(data.media_url);
        setImageError(false);
        setImageLoaded(false);
        setRefreshAttempted(true);
        onImageRefreshed?.(post.id, data.media_url);
        toast.success("Bild aktualisiert");
      } else {
        toast.error(data?.message || "Bild konnte nicht geladen werden");
      }
    } catch (err) {
      console.error('Failed to refresh image URL:', err);
      toast.error("Fehler beim Aktualisieren");
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh on error (only once)
  const handleImageError = async () => {
    setImageError(true);
    setImageLoaded(false);
    
    // Only auto-retry once if we haven't tried yet
    if (!refreshAttempted && post.ig_media_id && !refreshing) {
      setRefreshAttempted(true);
      await handleManualRefresh();
    }
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
    setImageError(false);
  };

  // Show expired state: error occurred OR no URL
  const showExpiredState = imageError || !localImageUrl;

  return (
    <Card
      className={cn(
        "glass-card overflow-hidden group transition-all duration-300 hover:scale-[1.02]",
        isUnicorn && "ring-2 ring-amber-500/50 bg-gradient-to-br from-amber-500/10 to-orange-500/10"
      )}
    >
      <CardContent className="p-0">
        {/* Image Preview */}
        <div className="aspect-video relative bg-muted">
          {localImageUrl && !showExpiredState ? (
            <>
              {/* Loading state while image loads */}
              {!imageLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted z-10">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              )}
              <img
                src={localImageUrl}
                alt="Post preview"
                className={cn(
                  "w-full h-full object-cover transition-opacity",
                  imageLoaded ? "opacity-100" : "opacity-0"
                )}
                onError={handleImageError}
                onLoad={handleImageLoad}
              />
            </>
          ) : (
            /* Expired/Error State with Refresh Button */
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/80 gap-3">
              {refreshing ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <span className="text-sm text-muted-foreground">Aktualisiere...</span>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-muted-foreground/10 flex items-center justify-center">
                    <ImageOff className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">Bild abgelaufen</span>
                  {post.ig_media_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleManualRefresh}
                      className="gap-2 mt-1"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Bild aktualisieren
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Stale indicator - shows refresh button on hover for images that might be stale */}
          {imageLoaded && isUrlStale() && !refreshing && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleManualRefresh}
              className="absolute bottom-3 left-3 gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 hover:bg-black/80 text-white border-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Aktualisieren
            </Button>
          )}

          {/* Unicorn Badge */}
          {isUnicorn && (
            <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
              <span>🦄</span> Top 1% Unicorn
            </div>
          )}

          {/* Virality Score */}
          <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-sm text-white text-xs font-semibold flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            {viralityScore.toLocaleString()}
          </div>

          {/* Link to Original - Safe Link Logic */}
          {(() => {
            const shortcode = extractShortcode(post.original_ig_permalink);
            const safeUrl = getInstagramUrl(post.original_ig_permalink, shortcode);
            
            if (!safeUrl) return null;
            
            return (
              <a
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`Öffnen: ${safeUrl}`}
                className="absolute bottom-3 right-3 p-2 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            );
          })()}
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          {/* Date - prominent */}
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-foreground">
              {post.published_at 
                ? format(new Date(post.published_at), "dd. MMM yyyy", { locale: de })
                : format(new Date(post.created_at), "dd. MMM yyyy", { locale: de })
              }
            </span>
            <span className="text-muted-foreground">
              {post.published_at 
                ? format(new Date(post.published_at), "HH:mm", { locale: de }) + " Uhr"
                : ""
              }
            </span>
          </div>

          {/* Performance Labels */}
          <div className="flex flex-wrap gap-2">
            {isHighEngagement && (
              <Badge variant="secondary" className="bg-rose-500/20 text-rose-400 border-rose-500/30">
                <Heart className="h-3 w-3 mr-1" />
                High Engagement
              </Badge>
            )}
            {isDiscussionStarter && (
              <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                <MessageCircle className="h-3 w-3 mr-1" />
                Diskussions-Starter
              </Badge>
            )}
          </div>

          {/* Caption Snippet */}
          <p className="text-sm text-foreground line-clamp-2">
            {post.caption?.slice(0, 120) || "Kein Text"}
            {(post.caption?.length || 0) > 120 && "..."}
          </p>

          {/* Stats Row */}
          <div className="flex items-center gap-4 text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Heart className="h-4 w-4 text-rose-500" />
              <span className="text-sm font-medium">{(post.likes_count || 0).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4 text-cyan-500" />
              <span className="text-sm font-medium">{(post.comments_count || 0).toLocaleString()}</span>
            </div>
            {(post.saved_count || 0) > 0 && (
              <div className="flex items-center gap-1.5">
                <Bookmark className="h-4 w-4 text-violet-500" />
                <span className="text-sm font-medium">{(post.saved_count || 0).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
