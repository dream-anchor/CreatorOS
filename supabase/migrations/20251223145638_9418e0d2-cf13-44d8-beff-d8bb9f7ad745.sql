-- Create enums for post status, asset source, user role, and log level
CREATE TYPE public.post_status AS ENUM ('IDEA', 'DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED', 'REJECTED');
CREATE TYPE public.post_format AS ENUM ('single');
CREATE TYPE public.asset_source AS ENUM ('upload', 'generate');
CREATE TYPE public.user_role AS ENUM ('owner', 'editor', 'reviewer');
CREATE TYPE public.log_level AS ENUM ('info', 'warn', 'error');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'owner',
  UNIQUE(user_id, role)
);

-- Brand rules table
CREATE TABLE public.brand_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tone_style TEXT,
  do_list TEXT[] DEFAULT '{}',
  dont_list TEXT[] DEFAULT '{}',
  emoji_level INT DEFAULT 1 CHECK (emoji_level >= 0 AND emoji_level <= 3),
  hashtag_min INT DEFAULT 8 CHECK (hashtag_min >= 0),
  hashtag_max INT DEFAULT 20 CHECK (hashtag_max >= hashtag_min),
  language_primary TEXT DEFAULT 'DE',
  content_pillars JSONB DEFAULT '[]',
  disclaimers TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Topics table
CREATE TABLE public.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  keywords TEXT[] DEFAULT '{}',
  priority INT DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  evergreen BOOLEAN DEFAULT false,
  seasonal_start DATE,
  seasonal_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Posts table
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  approved_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ,
  ig_media_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assets table
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  width INT,
  height INT,
  source public.asset_source DEFAULT 'upload',
  generator_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meta connections table (tokens stored server-only)
CREATE TABLE public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  page_id TEXT,
  page_name TEXT,
  ig_user_id TEXT,
  ig_username TEXT,
  token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Logs table
CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  level public.log_level DEFAULT 'info',
  event_type TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Settings table
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  posts_per_week INT DEFAULT 2,
  preferred_days TEXT[] DEFAULT '{"monday", "wednesday", "friday"}',
  preferred_hours JSONB DEFAULT '{"start": 9, "end": 18}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create storage bucket for assets
INSERT INTO storage.buckets (id, name, public) VALUES ('post-assets', 'post-assets', true);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.user_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own roles" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for brand_rules
CREATE POLICY "Users can view own brand rules" ON public.brand_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own brand rules" ON public.brand_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own brand rules" ON public.brand_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own brand rules" ON public.brand_rules FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for topics
CREATE POLICY "Users can view own topics" ON public.topics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own topics" ON public.topics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own topics" ON public.topics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own topics" ON public.topics FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for posts
CREATE POLICY "Users can view own posts" ON public.posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own posts" ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts" ON public.posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts" ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for assets
CREATE POLICY "Users can view own assets" ON public.assets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own assets" ON public.assets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own assets" ON public.assets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own assets" ON public.assets FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for meta_connections (no token exposure)
CREATE POLICY "Users can view own connection status" ON public.meta_connections 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own connection" ON public.meta_connections 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own connection" ON public.meta_connections 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own connection" ON public.meta_connections 
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for logs
CREATE POLICY "Users can view own logs" ON public.logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own logs" ON public.logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for settings
CREATE POLICY "Users can view own settings" ON public.settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.settings FOR UPDATE USING (auth.uid() = user_id);

-- Storage policies for post-assets bucket
CREATE POLICY "Users can view own assets" ON storage.objects 
  FOR SELECT USING (bucket_id = 'post-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can upload own assets" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'post-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own assets" ON storage.objects 
  FOR UPDATE USING (bucket_id = 'post-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own assets" ON storage.objects 
  FOR DELETE USING (bucket_id = 'post-assets' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_brand_rules_updated_at BEFORE UPDATE ON public.brand_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_topics_updated_at BEFORE UPDATE ON public.topics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_meta_connections_updated_at BEFORE UPDATE ON public.meta_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'display_name');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'owner');
  
  INSERT INTO public.settings (user_id)
  VALUES (NEW.id);
  
  INSERT INTO public.brand_rules (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();