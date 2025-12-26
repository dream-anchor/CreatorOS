-- Add formality_mode column to brand_rules for adaptive formality
ALTER TABLE public.brand_rules 
ADD COLUMN IF NOT EXISTS formality_mode text DEFAULT 'smart';

-- Add comment explaining the values
COMMENT ON COLUMN public.brand_rules.formality_mode IS 'Formality mode for replies: smart (auto-detect), du (always informal), sie (always formal)';