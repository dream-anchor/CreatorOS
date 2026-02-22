-- 004_troupe_folder_name.sql
-- Troupe-Fotos: Ordnername als eigene Spalte für ordnerbasierte Anzeige

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS troupe_folder_name TEXT;

CREATE INDEX IF NOT EXISTS idx_media_assets_troupe_folder
  ON public.media_assets (user_id, troupe_folder_name)
  WHERE troupe_folder_name IS NOT NULL;
