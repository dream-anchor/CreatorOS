-- Create table for emoji no-go terms
CREATE TABLE public.emoji_nogo_terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  term TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.emoji_nogo_terms ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own emoji nogo terms" 
ON public.emoji_nogo_terms 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own emoji nogo terms" 
ON public.emoji_nogo_terms 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own emoji nogo terms" 
ON public.emoji_nogo_terms 
FOR DELETE 
USING (auth.uid() = user_id);