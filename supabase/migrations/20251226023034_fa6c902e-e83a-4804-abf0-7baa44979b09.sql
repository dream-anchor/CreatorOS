-- Tabelle für Instagram Kommentare
CREATE TABLE public.instagram_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  ig_comment_id TEXT NOT NULL,
  ig_media_id TEXT NOT NULL,
  commenter_username TEXT,
  commenter_id TEXT,
  comment_text TEXT NOT NULL,
  comment_timestamp TIMESTAMPTZ NOT NULL,
  is_replied BOOLEAN DEFAULT false,
  is_hidden BOOLEAN DEFAULT false,
  is_critical BOOLEAN DEFAULT false,
  sentiment_score DECIMAL(3,2),
  ai_reply_suggestion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ig_comment_id)
);

-- Tabelle für Reply Queue (zeitversetzte Antworten)
CREATE TABLE public.reply_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES public.instagram_comments(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabelle für Blacklist Topics
CREATE TABLE public.blacklist_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes für Performance
CREATE INDEX idx_comments_user_unreplied ON public.instagram_comments(user_id, is_replied, is_hidden) WHERE is_replied = false AND is_hidden = false;
CREATE INDEX idx_comments_ig_media ON public.instagram_comments(ig_media_id);
CREATE INDEX idx_reply_queue_pending ON public.reply_queue(user_id, status) WHERE status = 'pending';

-- RLS aktivieren
ALTER TABLE public.instagram_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reply_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist_topics ENABLE ROW LEVEL SECURITY;

-- RLS Policies für instagram_comments
CREATE POLICY "Users can view own comments" ON public.instagram_comments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own comments" ON public.instagram_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments" ON public.instagram_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments" ON public.instagram_comments
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies für reply_queue
CREATE POLICY "Users can view own queue" ON public.reply_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own queue" ON public.reply_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queue" ON public.reply_queue
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own queue" ON public.reply_queue
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies für blacklist_topics
CREATE POLICY "Users can view own blacklist" ON public.blacklist_topics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own blacklist" ON public.blacklist_topics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own blacklist" ON public.blacklist_topics
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own blacklist" ON public.blacklist_topics
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger für updated_at
CREATE TRIGGER update_instagram_comments_updated_at
  BEFORE UPDATE ON public.instagram_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Default Blacklist-Eintrag "Pater Brown" wird per Code erstellt