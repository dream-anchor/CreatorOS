-- =====================================================
-- SMART REPLY AUTOMATION SETUP
-- =====================================================
-- Diese Datei manuell im Supabase SQL Editor ausführen!
-- Sie aktiviert die automatische Verarbeitung der Reply-Queue.
-- =====================================================

-- 1. Aktiviere pg_cron und pg_net Extensions
-- (Falls noch nicht aktiv, im Dashboard unter Extensions aktivieren)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =====================================================
-- A) MAGIC TRIGGER: Wake waiting replies when post is scheduled
-- =====================================================
-- Dieser Trigger feuert, wenn ein Post geplant wird (scheduled_at gesetzt)
-- und weckt alle wartenden Antworten auf.

CREATE OR REPLACE FUNCTION public.wake_waiting_replies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when scheduled_at is set/updated and status is SCHEDULED
  IF NEW.scheduled_at IS NOT NULL 
     AND NEW.status = 'SCHEDULED'
     AND (OLD.scheduled_at IS NULL OR NEW.scheduled_at != OLD.scheduled_at) THEN
    
    -- Update all waiting replies for this user
    -- Distribute them in the "Golden Window": -30min to +10min around post time
    UPDATE public.comment_reply_queue
    SET 
      status = 'pending',
      scheduled_for = NEW.scheduled_at - interval '30 minutes' + (random() * interval '40 minutes'),
      updated_at = now()
    WHERE user_id = NEW.user_id 
      AND status = 'waiting_for_post';
      
    RAISE NOTICE '[wake_waiting_replies] Updated % waiting replies for user %', 
      (SELECT count(*) FROM comment_reply_queue WHERE user_id = NEW.user_id AND status = 'pending'),
      NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS wake_replies_on_post_scheduled ON public.posts;

CREATE TRIGGER wake_replies_on_post_scheduled
  AFTER INSERT OR UPDATE OF scheduled_at, status
  ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.wake_waiting_replies();

-- =====================================================
-- B) PROCESS DUE REPLIES: Funktion zum Senden fälliger Antworten
-- =====================================================
-- Diese Funktion wird vom Cronjob aufgerufen und sendet HTTP-Requests
-- an die Edge Function process-reply-queue.

CREATE OR REPLACE FUNCTION public.process_due_replies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  anon_key text;
  request_id bigint;
BEGIN
  -- Get Supabase URL from environment
  -- WICHTIG: Ersetze diese Werte mit deinen echten Werten!
  supabase_url := 'https://utecdkwvjraucimdflnw.supabase.co';
  anon_key := current_setting('app.settings.anon_key', true);
  
  -- Fallback to hardcoded key if not set (for initial setup)
  IF anon_key IS NULL OR anon_key = '' THEN
    anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0ZWNka3d2anJhdWNpbWRmbG53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTUyMDQsImV4cCI6MjA4MjA3MTIwNH0.EptHetU3y_z7gxSedd9uds4ikI5DyJxvEQXtSSf6aLY';
  END IF;

  -- Check if there are any pending replies due
  IF EXISTS (
    SELECT 1 FROM public.comment_reply_queue 
    WHERE status = 'pending' 
      AND scheduled_for <= now()
    LIMIT 1
  ) THEN
    -- Call the Edge Function via pg_net
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/process-reply-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object('triggered_by', 'pg_cron')
    ) INTO request_id;
    
    RAISE NOTICE '[process_due_replies] Triggered Edge Function, request_id: %', request_id;
  ELSE
    RAISE NOTICE '[process_due_replies] No pending replies due at %', now();
  END IF;
END;
$$;

-- =====================================================
-- C) CRON JOB: Alle 5 Minuten prüfen und senden
-- =====================================================
-- Entferne alten Job falls vorhanden
SELECT cron.unschedule('process_reply_queue') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'process_reply_queue'
);

-- Erstelle neuen Cronjob (alle 5 Minuten)
SELECT cron.schedule(
  'process_reply_queue',
  '*/5 * * * *',
  $$SELECT public.process_due_replies();$$
);

-- =====================================================
-- D) HILFSFUNKTIONEN
-- =====================================================

-- Funktion zum manuellen Auslösen (für Tests)
CREATE OR REPLACE FUNCTION public.trigger_reply_processing()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.process_due_replies();
  RETURN 'Processing triggered';
END;
$$;

-- View für Queue-Status
CREATE OR REPLACE VIEW public.reply_queue_status AS
SELECT 
  status,
  count(*) as count,
  min(scheduled_for) as next_scheduled,
  max(scheduled_for) as last_scheduled
FROM public.comment_reply_queue
GROUP BY status
ORDER BY status;

-- =====================================================
-- VERIFICATION QUERIES (zum Testen ausführen)
-- =====================================================
-- 1. Prüfe ob Cronjob aktiv ist:
-- SELECT * FROM cron.job WHERE jobname = 'process_reply_queue';

-- 2. Prüfe Queue-Status:
-- SELECT * FROM public.reply_queue_status;

-- 3. Prüfe anstehende Replies:
-- SELECT id, status, scheduled_for, created_at 
-- FROM public.comment_reply_queue 
-- WHERE status = 'pending' 
-- ORDER BY scheduled_for 
-- LIMIT 10;

-- 4. Manuell Verarbeitung auslösen:
-- SELECT public.trigger_reply_processing();

-- =====================================================
-- WICHTIGE HINWEISE
-- =====================================================
-- 1. pg_cron muss im Supabase Dashboard aktiviert sein (Extensions)
-- 2. pg_net muss im Supabase Dashboard aktiviert sein (Extensions)
-- 3. Die Edge Function 'process-reply-queue' muss deployed sein
-- 4. Der Anon-Key ist im Code eingebettet - bei Änderung anpassen!
