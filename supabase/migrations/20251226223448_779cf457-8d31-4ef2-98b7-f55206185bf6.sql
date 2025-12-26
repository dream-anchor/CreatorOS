-- Add is_reference column to media_assets if it doesn't exist
-- This marks images that can be used for AI-generated montages

ALTER TABLE public.media_assets 
ADD COLUMN IF NOT EXISTS is_reference boolean DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.media_assets.is_reference IS 'Markiert Bilder die für KI-Montagen/Bildgenerierung verwendet werden dürfen';