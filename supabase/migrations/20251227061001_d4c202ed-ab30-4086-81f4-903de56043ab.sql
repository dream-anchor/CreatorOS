-- Create comment_reply_queue table for intelligent reply scheduling
CREATE TABLE public.comment_reply_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  comment_id UUID REFERENCES public.instagram_comments(id) ON DELETE CASCADE,
  ig_comment_id TEXT NOT NULL,
  reply_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'waiting_for_post')),
  scheduled_for TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.comment_reply_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own queue" ON public.comment_reply_queue
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own queue" ON public.comment_reply_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own queue" ON public.comment_reply_queue
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own queue" ON public.comment_reply_queue
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_comment_reply_queue_updated_at
  BEFORE UPDATE ON public.comment_reply_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for efficient queue processing
CREATE INDEX idx_comment_reply_queue_pending ON public.comment_reply_queue(status, scheduled_for) 
  WHERE status = 'pending';

CREATE INDEX idx_comment_reply_queue_waiting ON public.comment_reply_queue(status, user_id) 
  WHERE status = 'waiting_for_post';

-- Function to wake waiting replies when a post is scheduled
CREATE OR REPLACE FUNCTION public.wake_waiting_replies()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when scheduled_at is set/updated
  IF NEW.scheduled_at IS NOT NULL AND (OLD.scheduled_at IS NULL OR NEW.scheduled_at != OLD.scheduled_at) THEN
    -- Update all waiting replies for this user
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
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger on posts table for auto-wake
CREATE TRIGGER wake_replies_on_post_scheduled
  AFTER INSERT OR UPDATE OF scheduled_at ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.wake_waiting_replies();