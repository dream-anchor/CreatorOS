-- Add AI content classification columns to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS mood text,
ADD COLUMN IF NOT EXISTS topic_tags text[] DEFAULT '{}';

-- Add index for category analytics
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category) WHERE is_imported = true;
CREATE INDEX IF NOT EXISTS idx_posts_mood ON public.posts(mood) WHERE is_imported = true;