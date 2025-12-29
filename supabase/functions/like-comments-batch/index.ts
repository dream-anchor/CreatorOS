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

    console.log('[like-comments-batch] Starting batch like operation...');

    // Get all replied comments from instagram_comments table
    const { data: repliedComments, error: fetchError } = await supabase
      .from('instagram_comments')
      .select('ig_comment_id, user_id')
      .eq('is_replied', true);

    if (fetchError) throw fetchError;

    // Rename for consistency
    const sentReplies = repliedComments;

    if (!sentReplies || sentReplies.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No sent replies to like',
        liked: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get unique user_ids
    const userIds = [...new Set(sentReplies.map(r => r.user_id))];
    
    // Get tokens for all users
    const { data: connections } = await supabase
      .from('meta_connections')
      .select('user_id, token_encrypted')
      .in('user_id', userIds);

    const tokenMap = new Map(connections?.map(c => [c.user_id, c.token_encrypted]) || []);

    let likedCount = 0;
    let failedCount = 0;

    for (const reply of sentReplies) {
      const token = tokenMap.get(reply.user_id);
      if (!token) {
        console.log(`[like-comments-batch] No token for user ${reply.user_id}`);
        failedCount++;
        continue;
      }

      try {
        const likeUrl = `https://graph.facebook.com/v17.0/${reply.ig_comment_id}/likes`;
        
        const response = await fetch(likeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            access_token: token,
          }),
        });

        if (response.ok) {
          console.log(`[like-comments-batch] Liked comment ${reply.ig_comment_id}`);
          likedCount++;
        } else {
          const errorData = await response.json();
          console.warn(`[like-comments-batch] Failed to like ${reply.ig_comment_id}:`, errorData.error?.message);
          failedCount++;
        }

        // Rate limit protection
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error(`[like-comments-batch] Error liking ${reply.ig_comment_id}:`, err);
        failedCount++;
      }
    }

    console.log(`[like-comments-batch] Completed: ${likedCount} liked, ${failedCount} failed`);

    return new Response(JSON.stringify({
      success: true,
      total: sentReplies.length,
      liked: likedCount,
      failed: failedCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[like-comments-batch] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
