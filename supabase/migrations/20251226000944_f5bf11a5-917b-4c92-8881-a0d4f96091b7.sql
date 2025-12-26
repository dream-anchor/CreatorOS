-- Create content_snippets table for recycling timeless content
CREATE TABLE public.content_snippets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  title TEXT,
  category TEXT,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.content_snippets ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own snippets" ON public.content_snippets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snippets" ON public.content_snippets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snippets" ON public.content_snippets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own snippets" ON public.content_snippets
  FOR DELETE USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_content_snippets_updated_at
  BEFORE UPDATE ON public.content_snippets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();