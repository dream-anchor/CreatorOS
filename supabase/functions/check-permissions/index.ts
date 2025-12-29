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

    // Get token
    const { data: connection } = await supabase
      .from('meta_connections')
      .select('token_encrypted, ig_user_id')
      .limit(1)
      .single();

    if (!connection?.token_encrypted) {
      return new Response(JSON.stringify({ error: 'No token found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check token permissions via debug_token endpoint
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${connection.token_encrypted}&access_token=${connection.token_encrypted}`;
    
    const response = await fetch(debugUrl);
    const data = await response.json();

    return new Response(JSON.stringify({
      ig_user_id: connection.ig_user_id,
      token_info: data
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[check-permissions] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
