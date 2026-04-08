-- ============================================================
-- Migration 006: Pater Brown Auto-Posting
-- ============================================================

-- 1. episode-Feld zu events hinzufügen
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS episode TEXT;

-- 2. Pater Brown Brand Rules
-- user_id muss mit dem echten Pater-Brown-Account übereinstimmen
-- → nach dem ersten Login mit dem PB-Account diese Migration ausführen
-- Placeholder: wird via import-paterbrown-events.mjs mit echtem user_id ersetzt

-- Kommentar: Brand Rules werden programmatisch per Script gesetzt (siehe scripts/setup-paterbrown-brand.mjs)
-- damit die user_id korrekt übergeben werden kann.
