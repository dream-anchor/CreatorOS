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

    // Get token
    const { data: connection } = await supabase
      .from('meta_connections')
      .select('token_encrypted, ig_user_id')
      .limit(1)
      .single();

    if (!connection?.token_encrypted) {
      return new Response(JSON.stringify({ error: 'No token found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get a recent replied comment
    const { data: comment } = await supabase
      .from('instagram_comments')
      .select('ig_comment_id, ig_media_id, commenter_username')
      .eq('is_replied', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!comment) {
      return new Response(JSON.stringify({ error: 'No comment found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // First, check if the comment still exists by fetching it
    const checkUrl = `https://graph.facebook.com/v21.0/${comment.ig_comment_id}?fields=id,text,username&access_token=${connection.token_encrypted}`;
    
    console.log('[verify] Checking if comment exists:', comment.ig_comment_id);
    
    const checkResponse = await fetch(checkUrl);
    const checkData = await checkResponse.json();

    console.log('[verify] Comment check response:', checkData);

    if (!checkResponse.ok) {
      return new Response(JSON.stringify({
        comment_id: comment.ig_comment_id,
        commenter: comment.commenter_username,
        exists: false,
        check_error: checkData.error,
        conclusion: "Comment does not exist anymore on Instagram"
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Comment exists, now try to like it
    const likeUrl = `https://graph.facebook.com/v21.0/${comment.ig_comment_id}/likes`;
    
    console.log('[verify] Trying to like comment:', comment.ig_comment_id);
    
    const likeResponse = await fetch(likeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        access_token: connection.token_encrypted,
      }),
    });

    const likeData = await likeResponse.json();

    console.log('[verify] Like response:', likeData);

    return new Response(JSON.stringify({
      comment_id: comment.ig_comment_id,
      commenter: comment.commenter_username,
      comment_data: checkData,
      exists: true,
      like_success: likeResponse.ok,
      like_response: likeData
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[verify] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
