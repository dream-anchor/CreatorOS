export type PostStatus = 'IDEA' | 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED' | 'REJECTED';
export type PostFormat = 'single';
export type AssetSource = 'upload' | 'generate';
export type UserRole = 'owner' | 'editor' | 'reviewer';
export type LogLevel = 'info' | 'warn' | 'error';

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
}

export interface BrandRules {
  id: string;
  user_id: string;
  tone_style: string | null;
  do_list: string[];
  dont_list: string[];
  emoji_level: number;
  hashtag_min: number;
  hashtag_max: number;
  language_primary: string;
  content_pillars: Record<string, unknown>[];
  disclaimers: string | null;
  writing_style: string | null;
  example_posts: string | null;
  taboo_words: string[];
  ai_model: string;
  style_system_prompt: string | null;
  last_style_analysis_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  keywords: string[];
  priority: number;
  evergreen: boolean;
  seasonal_start: string | null;
  seasonal_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  topic_id: string | null;
  status: PostStatus;
  caption: string | null;
  caption_alt: string | null;
  caption_short: string | null;
  hashtags: string | null;
  alt_text: string | null;
  format: PostFormat;
  scheduled_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  ig_media_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  topic?: Topic;
  assets?: Asset[];
}

export interface Asset {
  id: string;
  user_id: string;
  post_id: string | null;
  storage_path: string;
  public_url: string | null;
  width: number | null;
  height: number | null;
  source: AssetSource;
  generator_meta: Record<string, unknown> | null;
  created_at: string;
}

export interface MetaConnection {
  id: string;
  user_id: string;
  page_id: string | null;
  page_name: string | null;
  ig_user_id: string | null;
  ig_username: string | null;
  token_encrypted: string | null;
  token_expires_at: string | null;
  connected_at: string | null;
  updated_at: string;
}

export interface Log {
  id: string;
  user_id: string;
  post_id: string | null;
  level: LogLevel;
  event_type: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  posts_per_week: number;
  preferred_days: string[];
  preferred_hours: { start: number; end: number };
  created_at: string;
  updated_at: string;
}

export interface DraftGenerationResult {
  hook_options: string[];
  caption: string;
  caption_alt: string;
  caption_short: string;
  hashtags: string;
  alt_text: string;
  asset_prompt: string;
  format: 'single';
}
