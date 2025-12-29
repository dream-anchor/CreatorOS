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

    // Get one recent replied comment
    const { data: comment } = await supabase
      .from('instagram_comments')
      .select('ig_comment_id, user_id, commenter_username')
      .eq('is_replied', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!comment) {
      return new Response(JSON.stringify({ error: 'No replied comment found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[test-like] Testing with comment:', comment);

    // Get token
    const { data: connection } = await supabase
      .from('meta_connections')
      .select('token_encrypted, ig_user_id')
      .eq('user_id', comment.user_id)
      .single();

    if (!connection?.token_encrypted) {
      return new Response(JSON.stringify({ error: 'No token found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[test-like] Using IG user ID:', connection.ig_user_id);

    // Try to like the comment
    const likeUrl = `https://graph.facebook.com/v21.0/${comment.ig_comment_id}/likes`;
    
    console.log('[test-like] Calling:', likeUrl);

    const response = await fetch(likeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${connection.token_encrypted}`,
        'Content-Type': 'application/json',
      },
    });

    const responseText = await response.text();
    console.log('[test-like] Response status:', response.status);
    console.log('[test-like] Response body:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    return new Response(JSON.stringify({
      comment_id: comment.ig_comment_id,
      commenter: comment.commenter_username,
      status: response.status,
      success: response.ok,
      response: responseData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[test-like] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
