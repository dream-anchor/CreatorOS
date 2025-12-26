-- Create table for daily account statistics tracking
CREATE TABLE public.daily_account_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  follower_count INTEGER DEFAULT 0,
  impressions_day INTEGER DEFAULT 0,
  reach_day INTEGER DEFAULT 0,
  profile_views INTEGER DEFAULT 0,
  website_clicks INTEGER DEFAULT 0,
  email_contacts INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  stories_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE public.daily_account_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own stats"
ON public.daily_account_stats
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stats"
ON public.daily_account_stats
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stats"
ON public.daily_account_stats
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own stats"
ON public.daily_account_stats
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_daily_account_stats_updated_at
BEFORE UPDATE ON public.daily_account_stats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for date range queries
CREATE INDEX idx_daily_account_stats_user_date ON public.daily_account_stats(user_id, date DESC);