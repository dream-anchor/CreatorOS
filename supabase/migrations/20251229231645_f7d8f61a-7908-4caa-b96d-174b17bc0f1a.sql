-- Create collaborators table for storing known collaborator profiles
CREATE TABLE public.collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  username TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  use_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, username)
);

-- Enable RLS
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own collaborators"
  ON public.collaborators FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own collaborators"
  ON public.collaborators FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own collaborators"
  ON public.collaborators FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own collaborators"
  ON public.collaborators FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster username search
CREATE INDEX idx_collaborators_username_search ON public.collaborators(user_id, username);
CREATE INDEX idx_collaborators_use_count ON public.collaborators(user_id, use_count DESC);

-- Trigger for updated_at
CREATE TRIGGER update_collaborators_updated_at
  BEFORE UPDATE ON public.collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();