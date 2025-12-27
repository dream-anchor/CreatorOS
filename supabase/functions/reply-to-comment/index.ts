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

    const body = await req.json();
    const { comment_id, reply_text, user_id: bodyUserId, queue_id } = body;

    // Support both authenticated calls and webhook calls (from cron/queue)
    let userId = bodyUserId;
    
    // If no user_id in body, try to get from auth header
    if (!userId) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const { data: { user }, error: authError } = await supabase.auth.getUser(
          authHeader.replace('Bearer ', '')
        );
        if (!authError && user) {
          userId = user.id;
        }
      }
    }

    if (!userId) {
      throw new Error('No user_id provided and no valid auth header');
    }

    if (!comment_id || !reply_text) {
      throw new Error('Missing comment_id or reply_text');
    }

    console.log(`[reply-to-comment] Replying to comment ${comment_id} for user ${userId}`);

    // Get the comment
    const { data: comment, error: commentError } = await supabase
      .from('instagram_comments')
      .select('*')
      .eq('id', comment_id)
      .eq('user_id', userId)
      .single();

    if (commentError || !comment) {
      console.error('[reply-to-comment] Comment not found:', commentError);
      throw new Error('Comment not found');
    }

    // Get Instagram connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (connError || !connection?.token_encrypted) {
      console.error('[reply-to-comment] No Instagram connection:', connError);
      throw new Error('Instagram nicht verbunden');
    }

    const accessToken = connection.token_encrypted;

    // Post reply to Instagram
    const replyUrl = `https://graph.facebook.com/v17.0/${comment.ig_comment_id}/replies`;
    
    const response = await fetch(replyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        message: reply_text,
        access_token: accessToken,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[reply-to-comment] Instagram API error:', responseData);
      
      // Update queue item if provided
      if (queue_id) {
        await supabase
          .from('comment_reply_queue')
          .update({ 
            status: 'failed', 
            error_message: responseData.error?.message || 'Instagram API error',
            updated_at: new Date().toISOString()
          })
          .eq('id', queue_id);
      }
      
      throw new Error(responseData.error?.message || 'Failed to post reply');
    }

    console.log(`[reply-to-comment] Successfully posted reply, ID: ${responseData.id}`);

    // Mark comment as replied
    await supabase
      .from('instagram_comments')
      .update({ is_replied: true })
      .eq('id', comment_id);

    // Update queue item if provided
    if (queue_id) {
      await supabase
        .from('comment_reply_queue')
        .update({ 
          status: 'sent', 
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', queue_id);
    }

    // Log event
    await supabase.from('logs').insert({
      user_id: userId,
      event_type: 'comment_replied',
      level: 'info',
      details: {
        comment_id,
        ig_comment_id: comment.ig_comment_id,
        reply_id: responseData.id,
        queue_id: queue_id || null,
        source: queue_id ? 'queue' : 'direct'
      }
    });

    return new Response(JSON.stringify({
      success: true,
      reply_id: responseData.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[reply-to-comment] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
