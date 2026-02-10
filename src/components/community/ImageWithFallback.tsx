import { useState, useEffect, useCallback } from "react";
import { Camera, RefreshCw } from "lucide-react";
import { invokeFunction } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ImageWithFallbackProps {
  src: string | null | undefined;
  alt: string;
  postId?: string;
  igMediaId?: string;
  className?: string;
  timeout?: number;
}

export function ImageWithFallback({
  src,
  alt,
  postId,
  igMediaId,
  className,
  timeout = 3000,
}: ImageWithFallbackProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(src || null);
  const [isLoading, setIsLoading] = useState(!!src);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const refreshMediaUrl = useCallback(async () => {
    if (!postId || !igMediaId) return null;

    try {
      const { data, error } = await invokeFunction<any>('refresh-media-url', {
        body: { post_id: postId, ig_media_id: igMediaId }
      });

      if (error || !data?.success) {
        console.error('Failed to refresh media URL:', error || data?.message);
        return null;
      }

      return data.media_url;
    } catch (err) {
      console.error('Error refreshing media URL:', err);
      return null;
    }
  }, [postId, igMediaId]);

  useEffect(() => {
    if (!src) {
      setIsLoading(false);
      setHasError(true);
      return;
    }

    setImageSrc(src);
    setIsLoading(true);
    setHasError(false);

    const timeoutId = setTimeout(async () => {
      // Check if still loading after timeout
      setIsLoading(false);
      setHasError(true);

      // Try to refresh the URL
      if (postId && igMediaId && retryCount === 0) {
        const newUrl = await refreshMediaUrl();
        if (newUrl) {
          setImageSrc(newUrl);
          setIsLoading(true);
          setHasError(false);
          setRetryCount(1);
        }
      }
    }, timeout);

    return () => clearTimeout(timeoutId);
  }, [src, retryCount]);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = async () => {
    setIsLoading(false);
    setHasError(true);

    if (postId && igMediaId && retryCount === 0) {
      const newUrl = await refreshMediaUrl();
      if (newUrl) {
        setImageSrc(newUrl);
        setIsLoading(true);
        setHasError(false);
        setRetryCount(1);
      }
    }
  };

  if (hasError || !imageSrc) {
    return (
      <div className={cn("bg-muted flex items-center justify-center", className)}>
        <Camera className="h-6 w-6 text-muted-foreground/50" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn("bg-muted flex items-center justify-center", className)}>
        <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
