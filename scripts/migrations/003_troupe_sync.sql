-- 003_troupe_sync.sql
-- Troupe (paterbrown.com Picks) → CreatorOS media_assets Sync-Support

ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS troupe_image_id TEXT;
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT 'upload';

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_troupe_id
  ON public.media_assets (troupe_image_id) WHERE troupe_image_id IS NOT NULL;
