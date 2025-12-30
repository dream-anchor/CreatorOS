-- Add answered_by_ignore_accounts table for storing accounts whose replies should hide comments
CREATE TABLE public.answered_by_ignore_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.answered_by_ignore_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own ignore accounts"
ON public.answered_by_ignore_accounts
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ignore accounts"
ON public.answered_by_ignore_accounts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ignore accounts"
ON public.answered_by_ignore_accounts
FOR DELETE
USING (auth.uid() = user_id);

-- Add replied_by_usernames column to instagram_comments to track who replied
ALTER TABLE public.instagram_comments
ADD COLUMN replied_by_usernames TEXT[] DEFAULT '{}'::TEXT[];