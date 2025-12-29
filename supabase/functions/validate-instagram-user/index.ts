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

    const { username } = await req.json();
    
    if (!username) {
      throw new Error('Username required');
    }

    // Clean username (remove @ if present)
    const cleanUsername = username.replace(/^@/, '').toLowerCase().trim();

    console.log(`[validate-instagram-user] Validating: ${cleanUsername}`);

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
    const igUserId = connection.ig_user_id;

    // Use Business Discovery API to lookup the user
    const discoveryUrl = `https://graph.facebook.com/v17.0/${igUserId}?fields=business_discovery.username(${cleanUsername}){profile_picture_url,name,username,id}&access_token=${accessToken}`;

    console.log(`[validate-instagram-user] Calling Business Discovery API`);

    const response = await fetch(discoveryUrl);
    const data = await response.json();

    if (data.error) {
      // Check if it's a "user not found" type error
      if (data.error.code === 100 || data.error.error_subcode === 2207013) {
        console.log(`[validate-instagram-user] User not found or private: ${cleanUsername}`);
        return new Response(JSON.stringify({
          success: false,
          found: false,
          message: 'Profil nicht gefunden oder privat/kein Business-Account'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.error('[validate-instagram-user] API Error:', data.error);
      throw new Error(data.error.message || 'API Fehler');
    }

    const businessDiscovery = data.business_discovery;
    
    if (!businessDiscovery) {
      return new Response(JSON.stringify({
        success: false,
        found: false,
        message: 'Profil nicht gefunden oder privat/kein Business-Account'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[validate-instagram-user] Found user: ${businessDiscovery.username}`);

    // Save to collaborators table (upsert)
    const { error: upsertError } = await supabase
      .from('collaborators')
      .upsert({
        user_id: user.id,
        username: businessDiscovery.username || cleanUsername,
        full_name: businessDiscovery.name || null,
        avatar_url: businessDiscovery.profile_picture_url || null,
        use_count: 1,
        last_used_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,username',
        ignoreDuplicates: false
      });

    if (upsertError) {
      // Try update instead if upsert fails due to constraint
      console.log('[validate-instagram-user] Upsert failed, trying update:', upsertError);
      
      const { error: updateError } = await supabase
        .from('collaborators')
        .update({
          full_name: businessDiscovery.name || null,
          avatar_url: businessDiscovery.profile_picture_url || null,
          last_used_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('username', businessDiscovery.username || cleanUsername);
        
      if (updateError) {
        console.error('[validate-instagram-user] Update also failed:', updateError);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      found: true,
      profile: {
        username: businessDiscovery.username,
        full_name: businessDiscovery.name,
        avatar_url: businessDiscovery.profile_picture_url,
        ig_id: businessDiscovery.id
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[validate-instagram-user] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
