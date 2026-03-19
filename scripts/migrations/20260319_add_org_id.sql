-- ============================================================
-- Migration: Add org_id to all tables for multi-tenancy prep
-- AUSNAHME: user_roles (bleibt ohne org_id)
-- ============================================================

-- CORE TABLES
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.brand_rules ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.instagram_tokens ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';

-- CONTENT & POST TABLES
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.slide_assets ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.content_snippets ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.content_plan ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';

-- EVENTS
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';

-- INSTAGRAM ENGAGEMENT
ALTER TABLE public.instagram_comments ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.reply_queue ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.comment_reply_queue ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.blacklist_topics ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.answered_by_ignore_accounts ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.emoji_nogo_terms ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.collaborators ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.reply_training_data ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';

-- ANALYTICS
ALTER TABLE public.daily_account_stats ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';

-- VIDEO
ALTER TABLE public.video_projects ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.video_segments ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.video_renders ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';

-- CHAT & UTILITY
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.upload_sessions ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.logs ADD COLUMN IF NOT EXISTS org_id TEXT NOT NULL DEFAULT 'default';

-- ============================================================
-- INDEXES on high-traffic tables
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_posts_org_id ON public.posts (org_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_org_id ON public.media_assets (org_id);
CREATE INDEX IF NOT EXISTS idx_events_org_id ON public.events (org_id);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_org_id ON public.instagram_comments (org_id);
CREATE INDEX IF NOT EXISTS idx_content_plan_org_id ON public.content_plan (org_id);
CREATE INDEX IF NOT EXISTS idx_logs_org_id ON public.logs (org_id);
