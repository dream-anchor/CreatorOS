/**
 * Instagram URL Utilities
 * 
 * CRITICAL: Always use /p/ format for ALL Instagram content (images, videos, reels).
 * Instagram has a bug where /reels/ links redirect logged-in users to the general feed.
 * The /p/ format works universally for all content types.
 */

/**
 * Extract shortcode from any Instagram URL format
 * Handles /p/, /reel/, /reels/, /tv/ patterns
 */
export function extractShortcode(url: string | null | undefined): string | null {
  if (!url) return null;
  
  // Match any Instagram content URL pattern
  const match = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Build a safe Instagram URL that always uses /p/ format
 * 
 * IMPORTANT: Never use /reels/ - it causes redirect bugs for logged-in users
 * The /p/ format works for ALL content types (images, videos, reels)
 * 
 * @param permalink - The original permalink from Instagram API (may contain /reels/)
 * @param shortcode - Direct shortcode if available
 * @returns Safe /p/ URL or null if no valid shortcode found
 */
export function getInstagramUrl(
  permalink: string | null | undefined, 
  shortcode?: string | null
): string | null {
  // Priority 1: Use provided shortcode directly
  if (shortcode && /^[A-Za-z0-9_-]+$/.test(shortcode)) {
    return `https://www.instagram.com/p/${shortcode}/`;
  }
  
  // Priority 2: Extract shortcode from permalink and rebuild with /p/
  const extractedShortcode = extractShortcode(permalink);
  if (extractedShortcode) {
    return `https://www.instagram.com/p/${extractedShortcode}/`;
  }
  
  // No valid shortcode found - return null to disable the link
  // FORBIDDEN: Never use internal IDs, media_id, or numeric values
  return null;
}

/**
 * Check if a URL is a valid Instagram content URL
 */
export function isValidInstagramUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/(www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+/.test(url);
}
