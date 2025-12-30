-- Add profile_picture_url column to meta_connections
ALTER TABLE public.meta_connections 
ADD COLUMN IF NOT EXISTS profile_picture_url text;