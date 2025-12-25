-- Add new columns for Tone of Voice settings
ALTER TABLE public.brand_rules
ADD COLUMN IF NOT EXISTS writing_style TEXT,
ADD COLUMN IF NOT EXISTS example_posts TEXT,
ADD COLUMN IF NOT EXISTS taboo_words TEXT[],
ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'google/gemini-2.5-flash';