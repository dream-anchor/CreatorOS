-- Add is_liked column to track liked status
ALTER TABLE public.instagram_comments 
ADD COLUMN IF NOT EXISTS is_liked boolean DEFAULT false;

-- Create index for efficient querying of unliked replied comments
CREATE INDEX IF NOT EXISTS idx_instagram_comments_replied_not_liked 
ON public.instagram_comments (is_replied, is_liked) 
WHERE is_replied = true AND is_liked = false;