-- 1. Create media_archive storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media-archive', 'media-archive', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for media-archive bucket
CREATE POLICY "Users can upload own media" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'media-archive' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own media" ON storage.objects
FOR SELECT USING (bucket_id = 'media-archive' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own media" ON storage.objects
FOR DELETE USING (bucket_id = 'media-archive' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Public can view media" ON storage.objects
FOR SELECT USING (bucket_id = 'media-archive');

-- 2. Create media_assets table with tags for intelligent matching
CREATE TABLE public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  filename TEXT,
  tags TEXT[] DEFAULT '{}',
  description TEXT,
  mood TEXT,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own media assets" ON public.media_assets
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media assets" ON public.media_assets
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own media assets" ON public.media_assets
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own media assets" ON public.media_assets
FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_media_assets_updated_at
BEFORE UPDATE ON public.media_assets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add carousel support to posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS slides JSONB DEFAULT NULL;

-- Update post_format enum to include carousel
ALTER TYPE post_format ADD VALUE IF NOT EXISTS 'carousel';

-- 4. Create table for slide assets (for carousels)
CREATE TABLE public.slide_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  slide_index INTEGER NOT NULL,
  storage_path TEXT,
  public_url TEXT,
  generated_text TEXT,
  asset_type TEXT DEFAULT 'image',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.slide_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own slide assets" ON public.slide_assets
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own slide assets" ON public.slide_assets
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own slide assets" ON public.slide_assets
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own slide assets" ON public.slide_assets
FOR DELETE USING (auth.uid() = user_id);