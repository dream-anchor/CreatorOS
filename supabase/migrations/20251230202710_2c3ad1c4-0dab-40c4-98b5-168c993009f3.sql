-- Add UNIQUE constraint for upsert to work
ALTER TABLE public.daily_account_stats 
ADD CONSTRAINT unique_daily_account_stats_user_date UNIQUE (user_id, date);

-- Add new columns for extended metrics
ALTER TABLE public.daily_account_stats 
ADD COLUMN IF NOT EXISTS accounts_engaged INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_interactions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS likes_day INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS comments_day INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS shares_day INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves_day INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS follower_delta INTEGER DEFAULT 0;