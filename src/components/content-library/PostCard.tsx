import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Post } from "@/types/database";

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
  const [refreshing, setRefreshing] = useState(false);
  const [localImageUrl, setLocalImageUrl] = useState(post.original_media_url);

  const handleImageError = async () => {
    setImageError(true);
    
    // Only try to refresh if we have ig_media_id
    if (!post.ig_media_id || refreshing) return;
    
    setRefreshing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

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
        onImageRefreshed?.(post.id, data.media_url);
      }
    } catch (err) {
      console.error('Failed to refresh image URL:', err);
    } finally {
      setRefreshing(false);
    }
  };

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
          {localImageUrl && !imageError ? (
            <img
              src={localImageUrl}
              alt="Post preview"
              className="w-full h-full object-cover"
              onError={handleImageError}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 to-cyan-500/10 gap-2">
              {refreshing ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">Lade Bild neu...</span>
                </>
              ) : imageError ? (
                <>
                  <ImageOff className="h-10 w-10 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground">Bild abgelaufen</span>
                </>
              ) : (
                <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
              )}
            </div>
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

          {/* Link to Original */}
          {post.original_ig_permalink && (
            <a
              href={post.original_ig_permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 right-3 p-2 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
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
