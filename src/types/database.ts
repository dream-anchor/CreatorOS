export type PostStatus = 'IDEA' | 'DRAFT' | 'READY_FOR_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED' | 'REJECTED';
export type PostFormat = 'single' | 'carousel' | 'reel';
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
  reply_style_system_prompt: string | null;
  reply_style_description: string | null;
  last_style_analysis_at: string | null;
  formality_mode: 'smart' | 'du' | 'sie';
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
  slides?: unknown[] | null;
  scheduled_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  published_at: string | null;
  ig_media_id: string | null;
  error_message: string | null;
  // Engagement metrics
  likes_count?: number;
  comments_count?: number;
  saved_count?: number;
  reach_count?: number;
  impressions_count?: number;
  engagement_rate?: number;
  // AI classification
  category?: string;
  mood?: string;
  topic_tags?: string[];
  is_imported?: boolean;
  original_ig_permalink?: string | null;
  original_media_url?: string | null;
  // Remix tracking
  remixed_from_id?: string | null;
  remix_reason?: string | null;
  created_at: string;
  updated_at: string;
  topic?: Topic;
  assets?: Asset[];
}

export interface SlideContent {
  slide_number: number;
  type: 'hook' | 'content' | 'cta';
  headline: string;
  body: string;
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
  auto_sync_enabled?: boolean;
  last_sync_at?: string | null;
  preferred_ai_model?: string;
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
  format: PostFormat;
  slides?: SlideContent[];
  suggested_tags?: string[];
  mood?: string;
}

// For the Remix feature
export interface TopPerformingPost extends Post {
  virality_score: number;
  performance_label: 'high_engagement' | 'discussion_starter' | 'viral_hit' | 'unicorn';
}

export interface RemasterResult extends DraftGenerationResult {
  original_analysis: string;
  format_flip_reason: string | null;
  new_hooks: string[];
  reuse_original_image: boolean;
}

// ========= REEL GENERATION TYPES =========

export type VideoProjectStatus =
  | 'uploaded'
  | 'analyzing_frames'
  | 'transcribing'
  | 'selecting_segments'
  | 'segments_ready'
  | 'rendering'
  | 'render_complete'
  | 'published'
  | 'failed';

export type SubtitleStyle = 'bold_center' | 'bottom_bar' | 'karaoke' | 'minimal';
export type TransitionStyle = 'smooth' | 'cut' | 'fade' | 'zoom';

export interface FrameAnalysisItem {
  frame_index: number;
  timestamp_ms: number;
  score: number;
  description: string;
  tags: string[];
  has_face: boolean;
  has_text: boolean;
  energy_level: 'low' | 'medium' | 'high';
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  text: string;
  words: TranscriptWord[];
  language: string;
}

export interface VideoProject {
  id: string;
  user_id: string;
  post_id: string | null;
  source_video_path: string;
  source_video_url: string | null;
  source_duration_ms: number | null;
  source_width: number | null;
  source_height: number | null;
  source_file_size: number | null;
  status: VideoProjectStatus;
  error_message: string | null;
  frame_analysis: FrameAnalysisItem[];
  transcript: Transcript | null;
  target_duration_sec: number;
  subtitle_style: SubtitleStyle;
  transition_style: TransitionStyle;
  background_music_url: string | null;
  shotstack_render_id: string | null;
  rendered_video_path: string | null;
  rendered_video_url: string | null;
  created_at: string;
  updated_at: string;
  segments?: VideoSegment[];
  renders?: VideoRender[];
}

export interface VideoSegment {
  id: string;
  project_id: string;
  user_id: string;
  segment_index: number;
  start_ms: number;
  end_ms: number;
  score: number | null;
  reason: string | null;
  transcript_text: string | null;
  is_user_modified: boolean;
  is_included: boolean;
  subtitle_text: string | null;
  created_at: string;
}

export interface VideoRender {
  id: string;
  project_id: string;
  user_id: string;
  shotstack_render_id: string;
  shotstack_status: string;
  config_snapshot: Record<string, unknown>;
  output_url: string | null;
  stored_video_path: string | null;
  stored_video_url: string | null;
  duration_sec: number | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}
