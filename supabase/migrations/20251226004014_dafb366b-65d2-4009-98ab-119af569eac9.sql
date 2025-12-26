-- Add unique constraint on ig_media_id for upsert functionality
-- First, handle any potential duplicates by keeping only the latest entry
DELETE FROM public.posts a
USING public.posts b
WHERE a.ig_media_id IS NOT NULL 
  AND a.ig_media_id = b.ig_media_id 
  AND a.created_at < b.created_at;

-- Create unique index on ig_media_id (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_ig_media_id_unique 
ON public.posts (ig_media_id) 
WHERE ig_media_id IS NOT NULL;

-- Add index for performance when querying by virality score
CREATE INDEX IF NOT EXISTS idx_posts_virality_lookup
ON public.posts (user_id, is_imported, status)
WHERE is_imported = true;