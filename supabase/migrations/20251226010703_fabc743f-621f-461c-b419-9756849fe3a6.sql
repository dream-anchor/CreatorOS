-- Add auto_sync_enabled column to settings table
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS auto_sync_enabled boolean DEFAULT true;

-- Add last_sync_at column to track when the last sync happened
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS last_sync_at timestamp with time zone;