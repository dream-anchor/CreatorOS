-- 005_thumbnail_url.sql
-- Thumbnail URL für schnellere Grid-Anzeige (v.a. Troupe-Bilder)

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
