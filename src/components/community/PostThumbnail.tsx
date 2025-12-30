import { useState } from "react";
import { Image as ImageIcon, Play, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface PostThumbnailProps {
  mediaUrl: string | null | undefined;
  permalink: string | null | undefined;
  className?: string;
}

/**
 * Generates a thumbnail URL from an Instagram video URL.
 * Instagram CDN video URLs can be converted to thumbnail by changing the extension.
 */
function getVideoThumbnail(url: string): string | null {
  // Check if it's a video URL (contains .mp4 or video indicators)
  if (url.includes('.mp4') || url.includes('video')) {
    // For Instagram CDN videos, we can't easily get a thumbnail
    // Return null to show a play icon placeholder instead
    return null;
  }
  return url;
}

export function PostThumbnail({ mediaUrl, permalink, className }: PostThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const isVideo = mediaUrl?.includes('.mp4') || mediaUrl?.includes('video');
  const thumbnailUrl = mediaUrl && !isVideo ? mediaUrl : null;
  
  const handleClick = () => {
    if (permalink) {
      window.open(permalink, '_blank', 'noopener,noreferrer');
    }
  };
  
  // Show placeholder for videos or when no media URL
  if (!thumbnailUrl || hasError) {
    return (
      <div 
        onClick={handleClick}
        className={cn(
          "bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors",
          className
        )}
      >
        {isVideo ? (
          <div className="relative">
            <div className="w-5 h-5 rounded-full bg-foreground/80 flex items-center justify-center">
              <Play className="h-2.5 w-2.5 text-background ml-0.5" fill="currentColor" />
            </div>
          </div>
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div 
      onClick={handleClick}
      className={cn(
        "relative overflow-hidden cursor-pointer group",
        className
      )}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
      <img 
        src={thumbnailUrl} 
        alt="" 
        className={cn(
          "w-full h-full object-cover transition-transform duration-200 group-hover:scale-105",
          isLoading && "opacity-0"
        )}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
        <ExternalLink className="h-3.5 w-3.5 text-white" />
      </div>
    </div>
  );
}
