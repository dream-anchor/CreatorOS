-- Add deep metrics columns to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS reach_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS engagement_rate numeric(5,2) DEFAULT 0;

-- Add index for performance analytics
CREATE INDEX IF NOT EXISTS idx_posts_engagement_rate ON public.posts(engagement_rate DESC) WHERE is_imported = true;
CREATE INDEX IF NOT EXISTS idx_posts_reach_count ON public.posts(reach_count DESC) WHERE is_imported = true;