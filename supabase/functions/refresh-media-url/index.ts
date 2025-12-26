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
    
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { post_id, ig_media_id } = await req.json();
    
    if (!post_id || !ig_media_id) {
      throw new Error('post_id and ig_media_id required');
    }

    // Get user's Meta connection
    const { data: connection } = await supabase
      .from('meta_connections')
      .select('token_encrypted')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!connection?.token_encrypted) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Instagram nicht verbunden' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = connection.token_encrypted;

    // Fetch fresh media URL from Instagram API
    const mediaUrl = `https://graph.facebook.com/v17.0/${ig_media_id}?fields=media_url&access_token=${accessToken}`;
    
    console.log(`Refreshing media URL for post ${post_id}, ig_media_id: ${ig_media_id}`);
    
    const response = await fetch(mediaUrl);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Instagram API error:', errorData);
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Media nicht mehr verfügbar'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    
    if (!data.media_url) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Keine Media-URL erhalten'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update the post with fresh URL
    const { error: updateError } = await supabase
      .from('posts')
      .update({ original_media_url: data.media_url })
      .eq('id', post_id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Update error:', updateError);
      throw new Error('Fehler beim Speichern');
    }

    console.log(`Successfully refreshed media URL for post ${post_id}`);

    return new Response(JSON.stringify({ 
      success: true,
      media_url: data.media_url
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
