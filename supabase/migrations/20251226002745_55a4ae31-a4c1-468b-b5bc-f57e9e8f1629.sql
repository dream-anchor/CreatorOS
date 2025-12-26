-- Add engagement metrics to posts table for virality scoring
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS likes_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS comments_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS saved_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS impressions_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_imported BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_ig_permalink TEXT,
ADD COLUMN IF NOT EXISTS original_media_url TEXT;

-- Create index for performance scoring queries
CREATE INDEX IF NOT EXISTS idx_posts_engagement_score 
ON public.posts (user_id, ((likes_count + (comments_count * 3) + (saved_count * 2)))) 
WHERE is_imported = true AND status = 'PUBLISHED';

-- Add remaster tracking
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS remixed_from_id UUID REFERENCES public.posts(id),
ADD COLUMN IF NOT EXISTS remix_reason TEXT;