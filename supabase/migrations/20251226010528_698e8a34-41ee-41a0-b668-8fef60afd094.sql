-- Add unique constraint on ig_media_id for upsert to work
CREATE UNIQUE INDEX IF NOT EXISTS posts_ig_media_id_unique 
ON public.posts (ig_media_id) 
WHERE ig_media_id IS NOT NULL;