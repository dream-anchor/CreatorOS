-- Add preferred_ai_model column to settings table
ALTER TABLE public.settings 
ADD COLUMN preferred_ai_model text DEFAULT 'google/gemini-2.5-flash';