-- Create upload_sessions table for tracking multi-image uploads
CREATE TABLE public.upload_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  uploaded_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_text TEXT,
  collaborators TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '10 minutes'),
  is_completed BOOLEAN NOT NULL DEFAULT false
);

-- Create index for fast session lookups
CREATE INDEX idx_upload_sessions_session_id ON public.upload_sessions(session_id);
CREATE INDEX idx_upload_sessions_user_id ON public.upload_sessions(user_id);
CREATE INDEX idx_upload_sessions_expires_at ON public.upload_sessions(expires_at);

-- Enable RLS
ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own sessions"
ON public.upload_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
ON public.upload_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
ON public.upload_sessions
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
ON public.upload_sessions
FOR DELETE
USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE public.upload_sessions IS 'Temporary sessions for multi-image uploads from iOS shortcut';