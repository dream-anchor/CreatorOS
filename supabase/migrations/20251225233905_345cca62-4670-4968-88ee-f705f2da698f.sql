-- Add column to track last style analysis
ALTER TABLE public.brand_rules
ADD COLUMN IF NOT EXISTS last_style_analysis_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS style_system_prompt TEXT;