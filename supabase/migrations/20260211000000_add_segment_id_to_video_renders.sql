-- ============================================================
-- Add segment_id to video_renders for individual clip rendering
-- ============================================================

-- Add segment_id column (nullable for backward compatibility with combined renders)
ALTER TABLE public.video_renders
ADD COLUMN segment_id UUID REFERENCES public.video_segments(id) ON DELETE CASCADE;

-- Add index for fast segment render lookups
CREATE INDEX idx_video_renders_segment
  ON public.video_renders(segment_id) WHERE segment_id IS NOT NULL;

-- Add render_mode column to track whether this is a combined or individual render
ALTER TABLE public.video_renders
ADD COLUMN render_mode TEXT DEFAULT 'combined' CHECK (render_mode IN ('combined', 'individual'));

-- Add index for filtering by render mode
CREATE INDEX idx_video_renders_mode
  ON public.video_renders(project_id, render_mode, created_at DESC);
