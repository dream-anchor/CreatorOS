-- Create instagram_tokens table for secure token storage
CREATE TABLE public.instagram_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ig_user_id text NOT NULL,
  access_token text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.instagram_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only authenticated users can manage their own tokens
CREATE POLICY "Users can view own tokens"
ON public.instagram_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens"
ON public.instagram_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens"
ON public.instagram_tokens
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
ON public.instagram_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for automatic updated_at
CREATE TRIGGER update_instagram_tokens_updated_at
BEFORE UPDATE ON public.instagram_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create unique constraint on user_id (one token per user)
ALTER TABLE public.instagram_tokens ADD CONSTRAINT instagram_tokens_user_id_unique UNIQUE (user_id);