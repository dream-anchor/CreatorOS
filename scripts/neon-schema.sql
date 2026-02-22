-- ============================================================
-- CreatorOS: Neon PostgreSQL Schema
-- Migrated from Supabase (no RLS, no auth.users references)
-- ============================================================

-- ENUMS
CREATE TYPE public.post_status AS ENUM (
  'IDEA', 'DRAFT', 'READY_FOR_REVIEW', 'APPROVED',
  'SCHEDULED', 'PUBLISHED', 'FAILED', 'REJECTED'
);

CREATE TYPE public.post_format AS ENUM ('single', 'carousel', 'reel');
CREATE TYPE public.asset_source AS ENUM ('upload', 'generate');
CREATE TYPE public.user_role AS ENUM ('owner', 'editor', 'reviewer');
CREATE TYPE public.log_level AS ENUM ('info', 'warn', 'error');

-- ============================================================
-- CORE TABLES
-- ============================================================

CREATE TABLE public.profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'owner',
  UNIQUE(user_id, role)
);

CREATE TABLE public.brand_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  tone_style TEXT,
  do_list TEXT[] DEFAULT '{}',
  dont_list TEXT[] DEFAULT '{}',
  emoji_level INT DEFAULT 1 CHECK (emoji_level >= 0 AND emoji_level <= 3),
  hashtag_min INT DEFAULT 8 CHECK (hashtag_min >= 0),
  hashtag_max INT DEFAULT 20 CHECK (hashtag_max >= hashtag_min),
  language_primary TEXT DEFAULT 'DE',
  content_pillars JSONB DEFAULT '[]',
  disclaimers TEXT,
  writing_style TEXT,
  example_posts TEXT,
  taboo_words TEXT[],
  ai_model TEXT DEFAULT 'google/gemini-2.5-flash',
  last_style_analysis_at TIMESTAMPTZ,
  style_system_prompt TEXT,
  formality_mode TEXT DEFAULT 'smart',
  reply_style_system_prompt TEXT,
  reply_style_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  posts_per_week INT DEFAULT 2,
  preferred_days TEXT[] DEFAULT '{"monday", "wednesday", "friday"}',
  preferred_hours JSONB DEFAULT '{"start": 9, "end": 18}',
  auto_sync_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  preferred_ai_model TEXT DEFAULT 'google/gemini-2.5-flash',
  auto_post_mode TEXT DEFAULT 'off'
    CHECK (auto_post_mode IN ('off', 'draft', 'review', 'auto')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  page_id TEXT,
  page_name TEXT,
  ig_user_id TEXT,
  ig_username TEXT,
  token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  profile_picture_url TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.instagram_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  ig_user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CONTENT & POST TABLES
-- ============================================================

CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  keywords TEXT[] DEFAULT '{}',
  priority INT DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  evergreen BOOLEAN DEFAULT FALSE,
  seasonal_start DATE,
  seasonal_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  status public.post_status NOT NULL DEFAULT 'DRAFT',
  caption TEXT,
  caption_alt TEXT,
  caption_short TEXT,
  hashtags TEXT,
  alt_text TEXT,
  format public.post_format DEFAULT 'single',
  scheduled_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  published_at TIMESTAMPTZ,
  ig_media_id TEXT UNIQUE,
  error_message TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  saved_count INTEGER DEFAULT 0,
  impressions_count INTEGER DEFAULT 0,
  reach_count INTEGER DEFAULT 0,
  engagement_rate NUMERIC(5,2) DEFAULT 0,
  is_imported BOOLEAN DEFAULT FALSE,
  original_ig_permalink TEXT,
  original_media_url TEXT,
  remixed_from_id UUID REFERENCES public.posts(id),
  remix_reason TEXT,
  category TEXT,
  mood TEXT,
  topic_tags TEXT[] DEFAULT '{}',
  collaborators TEXT[] DEFAULT '{}',
  slides JSONB DEFAULT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  auto_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  width INT,
  height INT,
  source public.asset_source DEFAULT 'upload',
  generator_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.slide_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  slide_index INTEGER NOT NULL,
  storage_path TEXT,
  public_url TEXT,
  generated_text TEXT,
  asset_type TEXT DEFAULT 'image',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.content_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  title TEXT,
  category TEXT,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  filename TEXT,
  tags TEXT[] DEFAULT '{}',
  description TEXT,
  mood TEXT,
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  is_selfie BOOLEAN DEFAULT FALSE,
  ai_usable BOOLEAN DEFAULT TRUE,
  is_reference BOOLEAN DEFAULT FALSE,
  ai_tags TEXT[] DEFAULT '{}',
  ai_description TEXT,
  analyzed BOOLEAN DEFAULT FALSE,
  is_good_reference BOOLEAN DEFAULT FALSE,
  dalle_persona_prompt TEXT,
  troupe_image_id TEXT,
  source_system TEXT DEFAULT 'upload',
  troupe_folder_name TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.content_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'approved', 'scheduled', 'published', 'rejected')),
  scheduled_for TIMESTAMPTZ,
  concept_note TEXT,
  target_audience TEXT,
  content_type TEXT DEFAULT 'single'
    CHECK (content_type IN ('single', 'carousel', 'reel', 'story')),
  topic_keywords TEXT[],
  generated_caption TEXT,
  generated_image_url TEXT,
  generated_image_prompt TEXT,
  source_media_id UUID REFERENCES public.media_assets(id),
  converted_to_post_id UUID REFERENCES public.posts(id),
  ai_model_used TEXT,
  generation_attempts INTEGER DEFAULT 0,
  feedback_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- EVENTS TABLE (Auto-Posting Agent)
-- ============================================================

CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
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
  image_pool_tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INSTAGRAM ENGAGEMENT TABLES
-- ============================================================

CREATE TABLE public.instagram_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  ig_comment_id TEXT NOT NULL UNIQUE,
  ig_media_id TEXT NOT NULL,
  commenter_username TEXT,
  commenter_id TEXT,
  comment_text TEXT NOT NULL,
  comment_timestamp TIMESTAMPTZ NOT NULL,
  is_replied BOOLEAN DEFAULT FALSE,
  is_hidden BOOLEAN DEFAULT FALSE,
  is_critical BOOLEAN DEFAULT FALSE,
  is_liked BOOLEAN DEFAULT FALSE,
  sentiment_score DECIMAL(3,2),
  ai_reply_suggestion TEXT,
  replied_by_usernames TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.reply_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  comment_id UUID NOT NULL REFERENCES public.instagram_comments(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.comment_reply_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  comment_id UUID REFERENCES public.instagram_comments(id) ON DELETE CASCADE,
  ig_comment_id TEXT NOT NULL,
  reply_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'waiting_for_post')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.blacklist_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.answered_by_ignore_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.emoji_nogo_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  term TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  use_count INTEGER DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, username)
);

CREATE TABLE public.reply_training_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  original_ai_reply TEXT,
  better_reply TEXT NOT NULL,
  correction_reason TEXT,
  correction_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  applied_to_model BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- ANALYTICS TABLES
-- ============================================================

CREATE TABLE public.daily_account_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  follower_count INTEGER DEFAULT 0,
  impressions_day INTEGER DEFAULT 0,
  reach_day INTEGER DEFAULT 0,
  profile_views INTEGER DEFAULT 0,
  website_clicks INTEGER DEFAULT 0,
  email_contacts INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  stories_count INTEGER DEFAULT 0,
  accounts_engaged INTEGER DEFAULT 0,
  total_interactions INTEGER DEFAULT 0,
  likes_day INTEGER DEFAULT 0,
  comments_day INTEGER DEFAULT 0,
  shares_day INTEGER DEFAULT 0,
  saves_day INTEGER DEFAULT 0,
  follower_delta INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- ============================================================
-- VIDEO REEL PIPELINE TABLES
-- ============================================================

CREATE TABLE public.video_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  source_video_path TEXT NOT NULL,
  source_video_url TEXT,
  source_duration_ms INTEGER,
  source_width INTEGER,
  source_height INTEGER,
  source_file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded'
    CHECK (status IN (
      'uploaded', 'analyzing_frames', 'transcribing',
      'selecting_segments', 'segments_ready', 'rendering',
      'render_complete', 'published', 'failed'
    )),
  error_message TEXT,
  frame_analysis JSONB DEFAULT '[]'::jsonb,
  transcript JSONB DEFAULT NULL,
  target_duration_sec INTEGER DEFAULT 30,
  subtitle_style TEXT DEFAULT 'bold_center',
  transition_style TEXT DEFAULT 'smooth',
  background_music_url TEXT,
  shotstack_render_id TEXT,
  rendered_video_path TEXT,
  rendered_video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.video_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.video_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  score NUMERIC(5,2),
  reason TEXT,
  transcript_text TEXT,
  is_user_modified BOOLEAN DEFAULT FALSE,
  is_included BOOLEAN DEFAULT TRUE,
  subtitle_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.video_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.video_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  shotstack_render_id TEXT NOT NULL,
  shotstack_status TEXT DEFAULT 'queued',
  config_snapshot JSONB NOT NULL,
  output_url TEXT,
  stored_video_path TEXT,
  stored_video_url TEXT,
  duration_sec NUMERIC(6,2),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CHAT & UTILITY TABLES
-- ============================================================

CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT,
  attachments JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  uploaded_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_text TEXT,
  collaborators TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  level public.log_level DEFAULT 'info',
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Posts
CREATE UNIQUE INDEX idx_posts_ig_media_id_unique ON public.posts (ig_media_id) WHERE ig_media_id IS NOT NULL;
CREATE INDEX idx_posts_virality_lookup ON public.posts (user_id, is_imported, status) WHERE is_imported = true;
CREATE INDEX idx_posts_engagement_rate ON public.posts (engagement_rate DESC) WHERE is_imported = true;
CREATE INDEX idx_posts_reach_count ON public.posts (reach_count DESC) WHERE is_imported = true;
CREATE INDEX idx_posts_category ON public.posts (category) WHERE is_imported = true;
CREATE INDEX idx_posts_mood ON public.posts (mood) WHERE is_imported = true;

-- Instagram comments
CREATE INDEX idx_comments_user_unreplied ON public.instagram_comments (user_id, is_replied, is_hidden)
  WHERE is_replied = false AND is_hidden = false;
CREATE INDEX idx_comments_ig_media ON public.instagram_comments (ig_media_id);
CREATE INDEX idx_instagram_comments_replied_not_liked ON public.instagram_comments (is_replied, is_liked)
  WHERE is_replied = true AND is_liked = false;

-- Reply queues
CREATE INDEX idx_reply_queue_pending ON public.reply_queue (user_id, status) WHERE status = 'pending';
CREATE INDEX idx_comment_reply_queue_pending ON public.comment_reply_queue (status, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX idx_comment_reply_queue_waiting ON public.comment_reply_queue (status, user_id)
  WHERE status = 'waiting_for_post';

-- Media assets
CREATE INDEX idx_media_assets_ai_tags ON public.media_assets USING GIN(ai_tags);
CREATE INDEX idx_media_assets_analyzed ON public.media_assets (analyzed) WHERE analyzed = false;
CREATE INDEX idx_media_assets_ai_usable ON public.media_assets (user_id) WHERE ai_usable = true;

-- Content planning
CREATE INDEX idx_content_plan_user_status ON public.content_plan (user_id, status);
CREATE INDEX idx_content_plan_scheduled ON public.content_plan (scheduled_for) WHERE status = 'scheduled';

-- Analytics
CREATE INDEX idx_daily_account_stats_user_date ON public.daily_account_stats (user_id, date DESC);

-- Chat
CREATE INDEX idx_chat_conversations_user_id ON public.chat_conversations (user_id);
CREATE INDEX idx_chat_conversations_updated_at ON public.chat_conversations (updated_at DESC);
CREATE INDEX idx_chat_messages_conversation_id ON public.chat_messages (conversation_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages (created_at);

-- Collaborators
CREATE INDEX idx_collaborators_username_search ON public.collaborators (user_id, username);
CREATE INDEX idx_collaborators_use_count ON public.collaborators (user_id, use_count DESC);

-- Upload sessions
CREATE INDEX idx_upload_sessions_session_id ON public.upload_sessions (session_id);
CREATE INDEX idx_upload_sessions_user_id ON public.upload_sessions (user_id);
CREATE INDEX idx_upload_sessions_expires_at ON public.upload_sessions (expires_at);

-- Video projects
CREATE INDEX idx_video_projects_user_status ON public.video_projects (user_id, status);
CREATE INDEX idx_video_segments_project ON public.video_segments (project_id, segment_index);
CREATE INDEX idx_video_renders_project ON public.video_renders (project_id, created_at DESC);

-- Reply training data
CREATE INDEX idx_reply_training_user_created ON public.reply_training_data (user_id, created_at DESC);

-- Events
CREATE INDEX idx_events_user_date ON public.events (user_id, date);
CREATE INDEX idx_events_upcoming ON public.events (date) WHERE is_active = true;

-- ============================================================
-- TRIGGER: updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_brand_rules_updated_at BEFORE UPDATE ON public.brand_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_settings_updated_at BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_meta_connections_updated_at BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_instagram_tokens_updated_at BEFORE UPDATE ON public.instagram_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_topics_updated_at BEFORE UPDATE ON public.topics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_posts_updated_at BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_content_snippets_updated_at BEFORE UPDATE ON public.content_snippets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_media_assets_updated_at BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_content_plan_updated_at BEFORE UPDATE ON public.content_plan
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_instagram_comments_updated_at BEFORE UPDATE ON public.instagram_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_collaborators_updated_at BEFORE UPDATE ON public.collaborators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_comment_reply_queue_updated_at BEFORE UPDATE ON public.comment_reply_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_daily_account_stats_updated_at BEFORE UPDATE ON public.daily_account_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_chat_conversations_updated_at BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_video_projects_updated_at BEFORE UPDATE ON public.video_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER tr_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id TEXT, _role public.user_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Wake waiting replies when a post is scheduled
CREATE OR REPLACE FUNCTION public.wake_waiting_replies()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.scheduled_at IS NOT NULL AND (OLD.scheduled_at IS NULL OR NEW.scheduled_at != OLD.scheduled_at) THEN
    UPDATE public.comment_reply_queue
    SET
      status = 'pending',
      scheduled_for = NEW.scheduled_at - interval '30 minutes' + (random() * interval '40 minutes'),
      updated_at = now()
    WHERE user_id = NEW.user_id
      AND status = 'waiting_for_post';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_posts_wake_waiting_replies
  AFTER INSERT OR UPDATE OF scheduled_at ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.wake_waiting_replies();
