import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validate IG User ID: must be numeric and start with 17841 (Instagram Business Account prefix)
const validateIgUserId = (id: string): { valid: boolean; error?: string } => {
  const trimmed = id.trim();
  
  if (!trimmed) {
    return { valid: false, error: 'ig_user_id is required' };
  }
  
  // Must be numeric
  if (!/^\d+$/.test(trimmed)) {
    return { valid: false, error: 'ig_user_id must be numeric' };
  }
  
  // Must start with 17841 (Instagram Business Account IDs start with this)
  if (!trimmed.startsWith('17841')) {
    return { valid: false, error: 'Invalid Instagram Business User ID. IDs start with 17841... You may have entered a Facebook App ID by mistake.' };
  }
  
  // Reasonable length check (IG IDs are typically 17-18 digits)
  if (trimmed.length < 15 || trimmed.length > 20) {
    return { valid: false, error: 'ig_user_id should be 15-20 digits long' };
  }
  
  return { valid: true };
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      console.log('Method not allowed:', req.method);
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.log('Auth error:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Parse request body
    const body = await req.json();
    const { ig_user_id, access_token } = body;

    // Validate ig_user_id format
    const validation = validateIgUserId(ig_user_id || '');
    if (!validation.valid) {
      console.log('Invalid ig_user_id:', validation.error);
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!access_token || typeof access_token !== 'string' || access_token.trim() === '') {
      console.log('Invalid access_token');
      return new Response(
        JSON.stringify({ error: 'access_token is required and must be a non-empty string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upsert token (insert or update if exists)
    const { data, error } = await supabase
      .from('instagram_tokens')
      .upsert(
        {
          user_id: user.id,
          ig_user_id: ig_user_id.trim(),
          access_token: access_token.trim(),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to store token', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Token stored successfully for user:', user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Instagram token stored successfully',
        ig_user_id: data.ig_user_id,
        created_at: data.created_at
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
