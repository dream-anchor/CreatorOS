
-- 1. Events-Tabelle
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME DEFAULT '20:00',
  venue TEXT NOT NULL,
  city TEXT NOT NULL,
  ticket_url TEXT,
  description TEXT,
  cast_members TEXT[] DEFAULT '{}',
  event_type TEXT DEFAULT 'standard',
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events" ON public.events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own events" ON public.events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own events" ON public.events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own events" ON public.events FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_events_user_date ON public.events (user_id, date);
CREATE INDEX IF NOT EXISTS idx_events_upcoming ON public.events (date) WHERE is_active = true;

CREATE TRIGGER tr_events_updated_at BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Posts erweitern
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS auto_template TEXT;

-- 3. Settings erweitern
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_post_mode TEXT DEFAULT 'off'
  CHECK (auto_post_mode IN ('off', 'draft', 'review', 'auto'));
