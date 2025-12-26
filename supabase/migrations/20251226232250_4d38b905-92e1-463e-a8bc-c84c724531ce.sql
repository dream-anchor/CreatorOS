-- Add AI analysis columns to media_assets
ALTER TABLE public.media_assets
ADD COLUMN IF NOT EXISTS ai_tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_description TEXT,
ADD COLUMN IF NOT EXISTS analyzed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_good_reference BOOLEAN DEFAULT false;

-- Create index for searching ai_tags
CREATE INDEX IF NOT EXISTS idx_media_assets_ai_tags ON public.media_assets USING GIN(ai_tags);

-- Create index for analyzed status
CREATE INDEX IF NOT EXISTS idx_media_assets_analyzed ON public.media_assets(analyzed) WHERE analyzed = false;