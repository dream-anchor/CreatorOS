-- Extend media_assets with AI-relevant fields (table already exists)
ALTER TABLE public.media_assets 
ADD COLUMN IF NOT EXISTS is_selfie boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_usable boolean DEFAULT true;

-- Comment for clarity
COMMENT ON COLUMN public.media_assets.is_selfie IS 'Photo of the account owner for AI montages';
COMMENT ON COLUMN public.media_assets.ai_usable IS 'Whether AI agent can use this for content generation';

-- Create content_plan table for AI agent drafts
CREATE TABLE public.content_plan (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'scheduled', 'published', 'rejected')),
  scheduled_for timestamp with time zone,
  concept_note text,
  target_audience text,
  content_type text DEFAULT 'single' CHECK (content_type IN ('single', 'carousel', 'reel', 'story')),
  topic_keywords text[],
  generated_caption text,
  generated_image_url text,
  generated_image_prompt text,
  source_media_id uuid REFERENCES public.media_assets(id),
  converted_to_post_id uuid REFERENCES public.posts(id),
  ai_model_used text,
  generation_attempts integer DEFAULT 0,
  feedback_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_plan ENABLE ROW LEVEL SECURITY;

-- RLS policies for content_plan
CREATE POLICY "Users can view own content plans" 
ON public.content_plan FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own content plans" 
ON public.content_plan FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own content plans" 
ON public.content_plan FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own content plans" 
ON public.content_plan FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_content_plan_updated_at
BEFORE UPDATE ON public.content_plan
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for performance
CREATE INDEX idx_content_plan_user_status ON public.content_plan(user_id, status);
CREATE INDEX idx_content_plan_scheduled ON public.content_plan(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_media_assets_ai_usable ON public.media_assets(user_id) WHERE ai_usable = true;