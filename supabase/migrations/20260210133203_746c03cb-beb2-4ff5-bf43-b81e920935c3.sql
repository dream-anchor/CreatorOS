-- ============================================================
-- Video Reel Pipeline: Tables, Bucket, RLS, Indexes
-- ============================================================

-- 1. Extend post_format enum to include 'reel'
ALTER TYPE public.post_format ADD VALUE IF NOT EXISTS 'reel';

-- 2. Create video_projects table (main entity with status machine)
CREATE TABLE public.video_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,

  -- Source video
  source_video_path TEXT NOT NULL,
  source_video_url TEXT,
  source_duration_ms INTEGER,
  source_width INTEGER,
  source_height INTEGER,
  source_file_size INTEGER,

  -- Processing status
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN (
      'uploaded',
      'analyzing_frames',
      'transcribing',
      'selecting_segments',
      'segments_ready',
      'rendering',
      'render_complete',
      'published',
      'failed'
    )),
  error_message TEXT,

  -- Frame analysis results (JSONB array)
  frame_analysis JSONB DEFAULT '[]'::jsonb,

  -- Transcription results
  transcript JSONB DEFAULT NULL,

  -- Reel configuration
  target_duration_sec INTEGER DEFAULT 30,
  subtitle_style TEXT DEFAULT 'bold_center',
  transition_style TEXT DEFAULT 'smooth',
  background_music_url TEXT,

  -- Shotstack render tracking
  shotstack_render_id TEXT,
  rendered_video_path TEXT,
  rendered_video_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create video_segments table (AI-selected or user-adjusted segments)
CREATE TABLE public.video_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.video_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  segment_index INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,

  -- AI analysis
  score NUMERIC(5,2),
  reason TEXT,
  transcript_text TEXT,

  -- User overrides
  is_user_modified BOOLEAN DEFAULT FALSE,
  is_included BOOLEAN DEFAULT TRUE,

  -- Subtitle text for this segment
  subtitle_text TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create video_renders table (render history / audit trail)
CREATE TABLE public.video_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.video_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  shotstack_render_id TEXT NOT NULL,
  shotstack_status TEXT DEFAULT 'queued',

  -- Configuration snapshot at render time
  config_snapshot JSONB NOT NULL,

  -- Result
  output_url TEXT,
  stored_video_path TEXT,
  stored_video_url TEXT,
  duration_sec NUMERIC(6,2),

  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create video-assets storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('video-assets', 'video-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Enable RLS on all new tables
ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_renders ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for video_projects
CREATE POLICY "Users can view own video projects" ON public.video_projects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own video projects" ON public.video_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own video projects" ON public.video_projects
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own video projects" ON public.video_projects
  FOR DELETE USING (auth.uid() = user_id);

-- 8. RLS Policies for video_segments
CREATE POLICY "Users can view own video segments" ON public.video_segments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own video segments" ON public.video_segments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own video segments" ON public.video_segments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own video segments" ON public.video_segments
  FOR DELETE USING (auth.uid() = user_id);

-- 9. RLS Policies for video_renders
CREATE POLICY "Users can view own video renders" ON public.video_renders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own video renders" ON public.video_renders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own video renders" ON public.video_renders
  FOR UPDATE USING (auth.uid() = user_id);

-- 10. Storage policies for video-assets bucket
CREATE POLICY "Users can upload own videos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'video-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own videos" ON storage.objects
  FOR SELECT USING (bucket_id = 'video-assets');
CREATE POLICY "Users can delete own videos" ON storage.objects
  FOR DELETE USING (bucket_id = 'video-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 11. Updated_at trigger for video_projects
CREATE TRIGGER update_video_projects_updated_at
  BEFORE UPDATE ON public.video_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Indexes for fast lookups
CREATE INDEX idx_video_projects_user_status
  ON public.video_projects(user_id, status);
CREATE INDEX idx_video_segments_project
  ON public.video_segments(project_id, segment_index);
CREATE INDEX idx_video_renders_project
  ON public.video_renders(project_id, created_at DESC);
