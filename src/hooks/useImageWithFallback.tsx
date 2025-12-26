import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseImageWithFallbackProps {
  src: string | null | undefined;
  postId?: string;
  igMediaId?: string;
  timeout?: number;
}

interface UseImageWithFallbackResult {
  imageSrc: string | null;
  isLoading: boolean;
  hasError: boolean;
  retry: () => void;
}

export function useImageWithFallback({
  src,
  postId,
  igMediaId,
  timeout = 3000,
}: UseImageWithFallbackProps): UseImageWithFallbackResult {
  const [imageSrc, setImageSrc] = useState<string | null>(src || null);
  const [isLoading, setIsLoading] = useState(!!src);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const refreshMediaUrl = useCallback(async () => {
    if (!postId || !igMediaId) return null;

    try {
      const { data, error } = await supabase.functions.invoke('refresh-media-url', {
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

    setIsLoading(true);
    setHasError(false);
    setImageSrc(src);

    // Set up timeout
    const timeoutId = setTimeout(async () => {
      if (isLoading) {
        console.log('Image load timeout, attempting refresh...');
        setHasError(true);
        setIsLoading(false);

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
      }
    }, timeout);

    return () => clearTimeout(timeoutId);
  }, [src, timeout, retryCount]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);

  const handleError = useCallback(async () => {
    setIsLoading(false);
    setHasError(true);

    // Try to refresh the URL once
    if (postId && igMediaId && retryCount === 0) {
      const newUrl = await refreshMediaUrl();
      if (newUrl) {
        setImageSrc(newUrl);
        setIsLoading(true);
        setHasError(false);
        setRetryCount(1);
      }
    }
  }, [postId, igMediaId, retryCount, refreshMediaUrl]);

  const retry = useCallback(() => {
    setRetryCount(0);
    setIsLoading(true);
    setHasError(false);
    setImageSrc(src || null);
  }, [src]);

  // Return with event handlers attached via effect
  useEffect(() => {
    if (!imageSrc) return;

    const img = new Image();
    img.onload = handleLoad;
    img.onerror = handleError;
    img.src = imageSrc;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [imageSrc, handleLoad, handleError]);

  return {
    imageSrc: hasError ? null : imageSrc,
    isLoading,
    hasError,
    retry,
  };
}
