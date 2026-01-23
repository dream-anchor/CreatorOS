import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A simple test image URL (1x1 pixel transparent PNG hosted publicly)
const TEST_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Test post requested by user:', user.id);

    // Fetch stored token from database
    const { data: tokenData, error: tokenError } = await supabase
      .from('instagram_tokens')
      .select('ig_user_id, access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenError) {
      console.error('Database error:', tokenError.message);
      return new Response(
        JSON.stringify({ error: 'Fehler beim Laden des Tokens aus der Datenbank' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenData) {
      return new Response(
        JSON.stringify({ error: 'Kein Instagram Token konfiguriert. Bitte zuerst einen Token speichern.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { ig_user_id, access_token } = tokenData;
    const caption = 'Test from CreatorOS ✨';

    console.log('Creating media container for IG user:', ig_user_id);

    // Step 1: Create media container
    const createMediaUrl = `https://graph.facebook.com/v20.0/${ig_user_id}/media`;
    const createMediaParams = new URLSearchParams({
      image_url: TEST_IMAGE_URL,
      caption: caption,
      access_token: access_token,
    });

    const createResponse = await fetch(createMediaUrl, {
      method: 'POST',
      body: createMediaParams,
    });

    const createData = await createResponse.json();

    if (!createResponse.ok) {
      console.error('Create media container error:', createData);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Fehler beim Erstellen des Media Containers: ${createData.error?.message || 'Unbekannter Fehler'}`,
          code: createData.error?.code,
          type: createData.error?.type
        }),
        { status: createResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const containerId = createData.id;
    console.log('Media container created:', containerId);

    // Step 2: Publish the media container
    const publishUrl = `https://graph.facebook.com/v20.0/${ig_user_id}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: containerId,
      access_token: access_token,
    });

    const publishResponse = await fetch(publishUrl, {
      method: 'POST',
      body: publishParams,
    });

    const publishData = await publishResponse.json();

    if (!publishResponse.ok) {
      console.error('Publish error:', publishData);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Fehler beim Veröffentlichen: ${publishData.error?.message || 'Unbekannter Fehler'}`,
          code: publishData.error?.code,
          type: publishData.error?.type
        }),
        { status: publishResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mediaId = publishData.id;
    console.log('Test post published successfully. Media ID:', mediaId);

    // Log the test post
    await supabase.from('logs').insert({
      user_id: user.id,
      event_type: 'test_instagram_post',
      level: 'info',
      details: { 
        media_id: mediaId,
        caption: caption,
        ig_user_id: ig_user_id
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Test-Post erfolgreich veröffentlicht!',
        media_id: mediaId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Interner Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
