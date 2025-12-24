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
    const META_APP_ID = Deno.env.get('META_APP_ID');
    const META_OAUTH_MODE = Deno.env.get('META_OAUTH_MODE') || 'facebook_app';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    
    // Build redirect URI
    const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/meta-oauth-callback`;
    
    // Determine scopes based on OAuth mode
    let scopes: string[];
    let authBaseUrl: string;
    
    if (META_OAUTH_MODE === 'instagram_app') {
      // Instagram Basic Display API / Instagram Login flow
      scopes = [
        'instagram_business_basic',
        'instagram_business_content_publish',
        'instagram_business_manage_messages',
        'instagram_business_manage_comments',
      ];
      authBaseUrl = 'https://www.instagram.com/oauth/authorize';
    } else {
      // Facebook Login for Business with Instagram Graph API
      scopes = [
        'instagram_basic',
        'instagram_content_publish',
        'pages_show_list',
        'pages_read_engagement',
        'business_management',
      ];
      authBaseUrl = 'https://www.facebook.com/v20.0/dialog/oauth';
    }

    if (req.method === 'GET') {
      // Debug endpoint - return config info (without secrets)
      const debugInfo = {
        meta_app_id: META_APP_ID ? `${META_APP_ID.slice(0, 4)}...${META_APP_ID.slice(-4)}` : 'NOT SET',
        meta_app_id_configured: !!META_APP_ID,
        meta_oauth_mode: META_OAUTH_MODE,
        redirect_uri: REDIRECT_URI,
        scopes: scopes,
        auth_base_url: authBaseUrl,
        timestamp: new Date().toISOString(),
      };
      
      console.log('[meta-oauth-config] Debug info requested:', debugInfo);
      
      return new Response(
        JSON.stringify(debugInfo),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get auth header for user verification
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(SUPABASE_URL!, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!META_APP_ID) {
      console.error('[meta-oauth-config] META_APP_ID not configured');
      return new Response(
        JSON.stringify({ 
          error: 'META_APP_ID not configured',
          details: 'Please set META_APP_ID in the server secrets'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build OAuth URL
    const scopeParam = scopes.join(',');
    const authUrl = `${authBaseUrl}?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scopeParam)}&state=${user.id}&response_type=code`;

    console.log('[meta-oauth-config] Generated OAuth URL for user:', user.id);
    console.log('[meta-oauth-config] Mode:', META_OAUTH_MODE);
    console.log('[meta-oauth-config] Scopes:', scopes);

    return new Response(
      JSON.stringify({ 
        auth_url: authUrl,
        meta_app_id_preview: `${META_APP_ID.slice(0, 4)}...`,
        mode: META_OAUTH_MODE,
        scopes: scopes
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[meta-oauth-config] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
