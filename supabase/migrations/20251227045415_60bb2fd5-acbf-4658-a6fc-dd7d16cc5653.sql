-- Add dalle_persona_prompt column to media_assets for storing visual DNA
ALTER TABLE public.media_assets 
ADD COLUMN dalle_persona_prompt text;