-- Migration 002: Event Image Pool Tags
-- Erlaubt pro Event die Steuerung, welche media_assets für Auto-Bilder verwendet werden

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS image_pool_tags TEXT[] DEFAULT '{}';
