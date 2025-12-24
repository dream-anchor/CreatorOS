import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mask token for safe logging: show first 6 + last 4 chars
function maskToken(token: string): string {
  if (!token || token.length < 12) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Method not allowed', status: 405 }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Missing authorization header', status: 401 }),
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
        JSON.stringify({ ok: false, error: 'Unauthorized', status: 401 }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[test-instagram-connection] User:', user.id);

    // Fetch stored token from database
    const { data: tokenData, error: tokenError } = await supabase
      .from('instagram_tokens')
      .select('ig_user_id, access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (tokenError) {
      console.error('[test-instagram-connection] DB error:', tokenError.message);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Fehler beim Laden des Tokens aus der Datenbank',
          errorText: tokenError.message,
          status: 500,
          meta: { igBusinessId: null, tokenPresent: false }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokenData) {
      console.log('[test-instagram-connection] No token found for user');
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Kein Instagram Token konfiguriert',
          errorText: 'Bitte zuerst einen Access Token und Instagram Business Account ID speichern.',
          status: 400,
          meta: { igBusinessId: null, tokenPresent: false }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { ig_user_id, access_token } = tokenData;
    const tokenMasked = maskToken(access_token);
    
    console.log('[test-instagram-connection] Token loaded:', {
      igBusinessId: ig_user_id,
      tokenMasked,
      tokenLength: access_token?.length || 0
    });

    // Step 1: Test /me endpoint
    const meEndpoint = `https://graph.facebook.com/v20.0/me?fields=id,username&access_token=${access_token}`;
    console.log('[test-instagram-connection] Calling /me endpoint...');
    console.log('[test-instagram-connection] URL:', meEndpoint.replace(access_token, tokenMasked));

    let meResponse: Response;
    let meText: string;
    let meData: any;

    try {
      meResponse = await fetch(meEndpoint);
      meText = await meResponse.text();
      console.log('[test-instagram-connection] /me status:', meResponse.status);
      console.log('[test-instagram-connection] /me body:', meText);
      
      try {
        meData = JSON.parse(meText);
      } catch {
        meData = { raw: meText };
      }
    } catch (fetchError) {
      console.error('[test-instagram-connection] /me fetch error:', fetchError);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Netzwerkfehler beim Abrufen von /me',
          errorText: String(fetchError),
          endpoint: '/me',
          status: 0,
          meta: { igBusinessId: ig_user_id, tokenPresent: true }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!meResponse.ok) {
      const errorInfo = meData.error || {};
      return new Response(
        JSON.stringify({ 
          ok: false,
          error: `Graph API Fehler: ${errorInfo.message || meText}`,
          errorText: meText,
          endpoint: '/me',
          status: meResponse.status,
          code: errorInfo.code,
          type: errorInfo.type,
          error_subcode: errorInfo.error_subcode,
          token_expired: errorInfo.code === 190 || errorInfo.error_subcode === 463,
          meta: { igBusinessId: ig_user_id, tokenPresent: true }
        }),
        { status: meResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Validate that me.id matches stored ig_user_id
    console.log('[test-instagram-connection] Validating ID match:', { apiId: meData.id, storedId: ig_user_id });
    
    if (meData.id !== ig_user_id) {
      return new Response(
        JSON.stringify({ 
          ok: false,
          error: 'Falsche Instagram Business Account ID',
          errorText: `Die gespeicherte ID (${ig_user_id}) stimmt nicht mit der API-Antwort (${meData.id}) überein. Vermutlich wurde die Facebook App ID eingetragen statt der Instagram Business Account ID.`,
          endpoint: '/me',
          status: 400,
          expected_id: meData.id,
          meta: { igBusinessId: ig_user_id, tokenPresent: true }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Test /media endpoint
    const mediaEndpoint = `https://graph.facebook.com/v20.0/${ig_user_id}/media?fields=id,caption,media_type,timestamp&limit=5&access_token=${access_token}`;
    console.log('[test-instagram-connection] Calling /media endpoint...');
    console.log('[test-instagram-connection] URL:', mediaEndpoint.replace(access_token, tokenMasked));

    let mediaResponse: Response;
    let mediaText: string;
    let mediaData: any;

    try {
      mediaResponse = await fetch(mediaEndpoint);
      mediaText = await mediaResponse.text();
      console.log('[test-instagram-connection] /media status:', mediaResponse.status);
      console.log('[test-instagram-connection] /media body:', mediaText);
      
      try {
        mediaData = JSON.parse(mediaText);
      } catch {
        mediaData = { raw: mediaText };
      }
    } catch (fetchError) {
      console.error('[test-instagram-connection] /media fetch error:', fetchError);
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Netzwerkfehler beim Abrufen von /media',
          errorText: String(fetchError),
          endpoint: '/media',
          status: 0,
          meta: { igBusinessId: ig_user_id, tokenPresent: true }
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!mediaResponse.ok) {
      const errorInfo = mediaData.error || {};
      return new Response(
        JSON.stringify({ 
          ok: false,
          error: `Graph API Fehler beim Abrufen der Medien: ${errorInfo.message || mediaText}`,
          errorText: mediaText,
          endpoint: '/media',
          status: mediaResponse.status,
          code: errorInfo.code,
          type: errorInfo.type,
          error_subcode: errorInfo.error_subcode,
          token_expired: errorInfo.code === 190 || errorInfo.error_subcode === 463,
          meta: { igBusinessId: ig_user_id, tokenPresent: true }
        }),
        { status: mediaResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[test-instagram-connection] Success! Username:', meData.username);

    return new Response(
      JSON.stringify({ 
        ok: true,
        success: true,
        username: meData.username,
        id: meData.id,
        media_count: mediaData.data?.length || 0,
        recent_media: mediaData.data || [],
        meta: { igBusinessId: ig_user_id, tokenPresent: true }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[test-instagram-connection] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: 'Interner Serverfehler',
        errorText: String(error),
        status: 500,
        meta: { igBusinessId: null, tokenPresent: false }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
