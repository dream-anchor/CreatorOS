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

    console.log('[backfill-likes] Starting backfill operation...');

    // Get all replied but not liked comments
    const { data: comments, error: fetchError } = await supabase
      .from('instagram_comments')
      .select('id, ig_comment_id, user_id, commenter_username')
      .eq('is_replied', true)
      .eq('is_liked', false)
      .limit(100); // Process in batches

    if (fetchError) {
      console.error('[backfill-likes] Fetch error:', fetchError);
      throw fetchError;
    }

    if (!comments || comments.length === 0) {
      console.log('[backfill-likes] No comments to like');
      return new Response(JSON.stringify({
        success: true,
        message: 'No comments to like',
        processed: 0,
        liked: 0,
        failed: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[backfill-likes] Found ${comments.length} comments to like`);

    // Get unique user_ids
    const userIds = [...new Set(comments.map(c => c.user_id))];
    
    // Get tokens for all users
    const { data: connections } = await supabase
      .from('meta_connections')
      .select('user_id, token_encrypted')
      .in('user_id', userIds);

    const tokenMap = new Map(connections?.map(c => [c.user_id, c.token_encrypted]) || []);

    let likedCount = 0;
    let failedCount = 0;
    const results: Array<{id: string, username: string, success: boolean, error?: string}> = [];

    for (const comment of comments) {
      const token = tokenMap.get(comment.user_id);
      if (!token) {
        console.log(`[backfill-likes] No token for user ${comment.user_id}`);
        failedCount++;
        results.push({ id: comment.ig_comment_id, username: comment.commenter_username, success: false, error: 'No token' });
        continue;
      }

      try {
        // Use the correct Instagram Graph API endpoint for liking comments
        // POST /{ig-comment-id}/likes
        const likeUrl = `https://graph.facebook.com/v19.0/${comment.ig_comment_id}/likes`;
        
        console.log(`[backfill-likes] Liking comment ${comment.ig_comment_id} from @${comment.commenter_username}`);
        
        const response = await fetch(likeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            access_token: token,
          }),
        });

        const responseData = await response.json();

        if (response.ok && responseData.success === true) {
          console.log(`[backfill-likes] ✓ Liked comment from @${comment.commenter_username}`);
          
          // Mark as liked in database
          await supabase
            .from('instagram_comments')
            .update({ is_liked: true })
            .eq('id', comment.id);
          
          likedCount++;
          results.push({ id: comment.ig_comment_id, username: comment.commenter_username, success: true });
        } else {
          const errorMsg = responseData.error?.message || 'Unknown error';
          console.warn(`[backfill-likes] ✗ Failed to like ${comment.ig_comment_id}: ${errorMsg}`);
          failedCount++;
          results.push({ id: comment.ig_comment_id, username: comment.commenter_username, success: false, error: errorMsg });
        }

        // Rate limit protection - 300ms between calls
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (err) {
        console.error(`[backfill-likes] Error liking ${comment.ig_comment_id}:`, err);
        failedCount++;
        results.push({ 
          id: comment.ig_comment_id, 
          username: comment.commenter_username, 
          success: false, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
      }
    }

    console.log(`[backfill-likes] Completed: ${likedCount} liked, ${failedCount} failed`);

    // Log summary
    await supabase.from('logs').insert({
      user_id: comments[0]?.user_id,
      event_type: 'backfill_likes_completed',
      level: failedCount > 0 ? 'warn' : 'info',
      details: {
        processed: comments.length,
        liked: likedCount,
        failed: failedCount
      }
    });

    return new Response(JSON.stringify({
      success: true,
      processed: comments.length,
      liked: likedCount,
      failed: failedCount,
      results: results.slice(0, 20) // Return first 20 results for debugging
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[backfill-likes] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
