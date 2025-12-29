import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[process-reply-queue] Starting queue processing...');

    // Get all pending replies where scheduled_for has passed
    const now = new Date().toISOString();
    const { data: pendingReplies, error: fetchError } = await supabase
      .from('comment_reply_queue')
      .select(`
        id,
        user_id,
        comment_id,
        ig_comment_id,
        reply_text
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(50); // Process max 50 per run

    if (fetchError) {
      console.error('[process-reply-queue] Error fetching queue:', fetchError);
      throw fetchError;
    }

    if (!pendingReplies || pendingReplies.length === 0) {
      console.log('[process-reply-queue] No pending replies to process');
      return new Response(JSON.stringify({
        success: true,
        processed: 0,
        message: 'No pending replies'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[process-reply-queue] Found ${pendingReplies.length} replies to process`);

    let sentCount = 0;
    let failedCount = 0;

    for (const reply of pendingReplies) {
      try {
        // Get the original comment to verify it exists
        const { data: comment, error: commentError } = await supabase
          .from('instagram_comments')
          .select('ig_comment_id, is_replied')
          .eq('id', reply.comment_id)
          .maybeSingle();

        if (commentError || !comment) {
          console.log(`[process-reply-queue] Comment ${reply.comment_id} not found, marking as failed`);
          await supabase
            .from('comment_reply_queue')
            .update({ 
              status: 'failed', 
              error_message: 'Comment not found',
              updated_at: now 
            })
            .eq('id', reply.id);
          failedCount++;
          continue;
        }

        // Skip if already replied
        if (comment.is_replied) {
          console.log(`[process-reply-queue] Comment ${reply.comment_id} already replied, marking as sent`);
          await supabase
            .from('comment_reply_queue')
            .update({ 
              status: 'sent', 
              sent_at: now,
              updated_at: now 
            })
            .eq('id', reply.id);
          sentCount++;
          continue;
        }

        // Get Instagram token for user
        const { data: connection, error: connError } = await supabase
          .from('meta_connections')
          .select('token_encrypted')
          .eq('user_id', reply.user_id)
          .maybeSingle();

        if (connError || !connection?.token_encrypted) {
          console.log(`[process-reply-queue] No Instagram connection for user ${reply.user_id}`);
          await supabase
            .from('comment_reply_queue')
            .update({ 
              status: 'failed', 
              error_message: 'No Instagram connection',
              updated_at: now 
            })
            .eq('id', reply.id);
          failedCount++;
          continue;
        }

        // 1. Like the comment first
        const likeUrl = `https://graph.facebook.com/v17.0/${reply.ig_comment_id}/likes`;
        
        const likeResponse = await fetch(likeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            access_token: connection.token_encrypted,
          }),
        });

        if (likeResponse.ok) {
          console.log(`[process-reply-queue] Liked comment ${reply.ig_comment_id}`);
        } else {
          const likeError = await likeResponse.json();
          console.warn(`[process-reply-queue] Could not like comment (non-blocking):`, likeError.error?.message);
        }

        // 2. Post reply to Instagram
        const replyUrl = `https://graph.facebook.com/v17.0/${reply.ig_comment_id}/replies`;
        
        const response = await fetch(replyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            message: reply.reply_text,
            access_token: connection.token_encrypted,
          }),
        });

        const responseData = await response.json();

        if (!response.ok) {
          console.error(`[process-reply-queue] Instagram API error for ${reply.id}:`, responseData);
          await supabase
            .from('comment_reply_queue')
            .update({ 
              status: 'failed', 
              error_message: responseData.error?.message || 'Instagram API error',
              updated_at: now 
            })
            .eq('id', reply.id);
          failedCount++;
          continue;
        }

        console.log(`[process-reply-queue] Successfully sent reply ${reply.id}, IG reply ID: ${responseData.id}`);

        // Mark queue item as sent
        await supabase
          .from('comment_reply_queue')
          .update({ 
            status: 'sent', 
            sent_at: now,
            updated_at: now 
          })
          .eq('id', reply.id);

        // Mark original comment as replied
        await supabase
          .from('instagram_comments')
          .update({ is_replied: true })
          .eq('id', reply.comment_id);

        // Log success
        await supabase.from('logs').insert({
          user_id: reply.user_id,
          event_type: 'queued_reply_sent',
          level: 'info',
          details: {
            queue_id: reply.id,
            comment_id: reply.comment_id,
            ig_reply_id: responseData.id,
            liked: likeResponse.ok
          }
        });

        sentCount++;

        // Small delay between API calls to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (err) {
        console.error(`[process-reply-queue] Error processing reply ${reply.id}:`, err);
        await supabase
          .from('comment_reply_queue')
          .update({ 
            status: 'failed', 
            error_message: err instanceof Error ? err.message : 'Unknown error',
            updated_at: now 
          })
          .eq('id', reply.id);
        failedCount++;
      }
    }

    console.log(`[process-reply-queue] Completed: ${sentCount} sent, ${failedCount} failed`);

    return new Response(JSON.stringify({
      success: true,
      processed: pendingReplies.length,
      sent: sentCount,
      failed: failedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[process-reply-queue] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
