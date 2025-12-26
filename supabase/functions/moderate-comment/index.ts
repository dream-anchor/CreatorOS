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

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { comment_id, action } = await req.json();

    if (!comment_id || !action) {
      throw new Error('Missing comment_id or action');
    }

    if (!['hide', 'delete', 'block'].includes(action)) {
      throw new Error('Invalid action. Must be hide, delete, or block');
    }

    console.log(`[moderate-comment] ${action} comment ${comment_id}`);

    // Get the comment
    const { data: comment, error: commentError } = await supabase
      .from('instagram_comments')
      .select('*')
      .eq('id', comment_id)
      .eq('user_id', user.id)
      .single();

    if (commentError || !comment) {
      throw new Error('Comment not found');
    }

    // Get Instagram connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connError || !connection?.token_encrypted) {
      throw new Error('Instagram nicht verbunden');
    }

    const accessToken = connection.token_encrypted;
    let igApiResult: any = null;

    if (action === 'hide') {
      // Hide comment on Instagram
      const hideUrl = `https://graph.facebook.com/v17.0/${comment.ig_comment_id}`;
      
      const response = await fetch(hideUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          hide: 'true',
          access_token: accessToken,
        }),
      });

      igApiResult = await response.json();
      
      if (!response.ok) {
        console.error('Instagram API error:', igApiResult);
        // Don't throw - continue with local update
      }

      // Mark as hidden locally
      await supabase
        .from('instagram_comments')
        .update({ is_hidden: true })
        .eq('id', comment_id);

    } else if (action === 'delete') {
      // Delete comment on Instagram
      const deleteUrl = `https://graph.facebook.com/v17.0/${comment.ig_comment_id}?access_token=${accessToken}`;
      
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
      });

      igApiResult = await response.json();
      
      if (!response.ok) {
        console.error('Instagram API error:', igApiResult);
      }

      // Delete from local database
      await supabase
        .from('instagram_comments')
        .delete()
        .eq('id', comment_id);

    } else if (action === 'block') {
      // Block user - Note: Instagram API might not support this directly via comments API
      // We'll mark locally and attempt API call
      
      // Mark as hidden locally for now
      await supabase
        .from('instagram_comments')
        .update({ is_hidden: true })
        .eq('id', comment_id);

      // Also hide all other comments from this user
      if (comment.commenter_id) {
        await supabase
          .from('instagram_comments')
          .update({ is_hidden: true })
          .eq('user_id', user.id)
          .eq('commenter_id', comment.commenter_id);
      }
    }

    // Log event
    await supabase.from('logs').insert({
      user_id: user.id,
      event_type: `comment_${action}`,
      level: 'info',
      details: {
        comment_id,
        ig_comment_id: comment.ig_comment_id,
        commenter: comment.commenter_username
      }
    });

    return new Response(JSON.stringify({
      success: true,
      action,
      ig_result: igApiResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[moderate-comment] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
