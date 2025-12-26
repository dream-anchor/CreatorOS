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

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Get request body
    const { ig_media_id, post_id } = await req.json();

    if (!ig_media_id) {
      throw new Error('ig_media_id ist erforderlich');
    }

    console.log(`[repair-post-metadata] Starting repair for media_id: ${ig_media_id}, post_id: ${post_id}, user: ${user.id}`);

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connError || !connection?.token_encrypted) {
      throw new Error('Instagram nicht verbunden');
    }

    const accessToken = connection.token_encrypted;
    const myIgUserId = connection.ig_user_id;

    // Fetch fresh metadata from Instagram API for this specific media
    const apiUrl = `https://graph.facebook.com/v17.0/${ig_media_id}?fields=id,permalink,shortcode,caption,media_url,media_type,timestamp,like_count,comments_count,owner&access_token=${accessToken}`;
    
    console.log(`[repair-post-metadata] Fetching from Instagram API...`);

    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[repair-post-metadata] Instagram API error:', errorData);
      
      // Check if this is an access error (foreign content)
      if (errorData.error?.code === 100 || errorData.error?.code === 10) {
        throw new Error('Dieser Post gehört nicht zu deinem Account oder ist nicht mehr verfügbar.');
      }
      
      throw new Error(errorData.error?.message || 'Instagram API Fehler');
    }

    const mediaData = await response.json();
    
    console.log(`[repair-post-metadata] Received data:`, {
      id: mediaData.id,
      permalink: mediaData.permalink,
      shortcode: mediaData.shortcode,
      hasCaption: !!mediaData.caption,
      hasMediaUrl: !!mediaData.media_url,
      owner: mediaData.owner,
    });

    // SECURITY CHECK: Verify this media belongs to the authenticated user
    if (mediaData.owner?.id && mediaData.owner.id !== myIgUserId) {
      console.error(`[repair-post-metadata] SECURITY: Owner mismatch! Media owner: ${mediaData.owner?.id}, My IG User: ${myIgUserId}`);
      throw new Error('Dieser Post gehört nicht zu deinem Instagram-Account!');
    }

    // Update the post in database with fresh data
    const updateData: Record<string, unknown> = {
      original_ig_permalink: mediaData.permalink || null,
      original_media_url: mediaData.media_url || null,
      updated_at: new Date().toISOString(),
    };

    // Only update caption if we got one from API
    if (mediaData.caption) {
      updateData.caption = mediaData.caption;
    }

    // Update engagement metrics if available
    if (typeof mediaData.like_count === 'number') {
      updateData.likes_count = mediaData.like_count;
    }
    if (typeof mediaData.comments_count === 'number') {
      updateData.comments_count = mediaData.comments_count;
    }

    // Perform the update
    const { data: updatedPost, error: updateError } = await supabase
      .from('posts')
      .update(updateData)
      .eq('ig_media_id', ig_media_id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('[repair-post-metadata] Update error:', updateError);
      throw new Error('Fehler beim Aktualisieren der Datenbank');
    }

    // Log the repair action
    await supabase.from('logs').insert({
      user_id: user.id,
      event_type: 'post_metadata_repaired',
      level: 'info',
      post_id: post_id || null,
      details: {
        ig_media_id: ig_media_id,
        new_permalink: mediaData.permalink,
        new_media_url: mediaData.media_url ? 'updated' : 'not available',
        owner_verified: mediaData.owner?.id === myIgUserId,
      },
    });

    console.log(`[repair-post-metadata] Successfully repaired post ${ig_media_id}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Metadaten erfolgreich repariert',
      data: {
        permalink: mediaData.permalink,
        shortcode: mediaData.shortcode,
        media_url: mediaData.media_url,
        caption_preview: mediaData.caption?.substring(0, 50) + '...',
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('[repair-post-metadata] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false,
      error: message 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
