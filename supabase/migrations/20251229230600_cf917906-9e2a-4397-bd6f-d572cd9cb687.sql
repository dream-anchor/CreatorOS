-- Add collaborators field to posts table for Instagram Collab feature
ALTER TABLE public.posts 
ADD COLUMN collaborators text[] DEFAULT '{}'::text[];

-- Add index for posts with collaborators (for filtering)
CREATE INDEX idx_posts_has_collaborators ON public.posts ((array_length(collaborators, 1) > 0)) WHERE collaborators IS NOT NULL AND array_length(collaborators, 1) > 0;

COMMENT ON COLUMN public.posts.collaborators IS 'List of Instagram usernames to invite as collaborators (without @ symbol)';