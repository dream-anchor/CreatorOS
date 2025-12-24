import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    console.log('Testing Instagram connection for user:', user.id);

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

    // Step 1: Test /me endpoint
    console.log('Testing /me endpoint...');
    const meResponse = await fetch(
      `https://graph.facebook.com/v20.0/me?fields=id,username&access_token=${access_token}`
    );
    
    const meData = await meResponse.json();

    if (!meResponse.ok) {
      console.error('Graph API /me error:', meData.error?.message);
      
      // Check for expired token
      if (meData.error?.code === 190 || meData.error?.error_subcode === 463) {
        return new Response(
          JSON.stringify({ 
            error: 'Token abgelaufen',
            token_expired: true,
            details: 'Der Access Token ist abgelaufen. Bitte generiere einen neuen Token im Meta Developer Dashboard.'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: `Graph API Fehler: ${meData.error?.message || 'Unbekannter Fehler'}`,
          code: meData.error?.code,
          type: meData.error?.type
        }),
        { status: meResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Validate that me.id matches stored ig_user_id
    console.log('Validating user ID match...');
    if (meData.id !== ig_user_id) {
      return new Response(
        JSON.stringify({ 
          error: 'Falsche Instagram User ID',
          details: `Die gespeicherte ID (${ig_user_id}) stimmt nicht mit der API-Antwort (${meData.id}) überein. Du hast vermutlich die App-ID eingetragen statt der Instagram User ID.`,
          expected_id: meData.id
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Test media endpoint
    console.log('Testing /media endpoint...');
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v20.0/${ig_user_id}/media?fields=id,caption,media_type,timestamp&limit=5&access_token=${access_token}`
    );
    
    const mediaData = await mediaResponse.json();

    if (!mediaResponse.ok) {
      console.error('Graph API /media error:', mediaData.error?.message);
      
      // Check for expired token
      if (mediaData.error?.code === 190 || mediaData.error?.error_subcode === 463) {
        return new Response(
          JSON.stringify({ 
            error: 'Token abgelaufen',
            token_expired: true,
            details: 'Der Access Token ist abgelaufen. Bitte generiere einen neuen Token im Meta Developer Dashboard.'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: `Graph API Fehler beim Abrufen der Medien: ${mediaData.error?.message || 'Unbekannter Fehler'}`,
          code: mediaData.error?.code,
          type: mediaData.error?.type
        }),
        { status: mediaResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Connection test successful for user:', meData.username);

    return new Response(
      JSON.stringify({ 
        success: true,
        username: meData.username,
        id: meData.id,
        media_count: mediaData.data?.length || 0,
        recent_media: mediaData.data || []
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
