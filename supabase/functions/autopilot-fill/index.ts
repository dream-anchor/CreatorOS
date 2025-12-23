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

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    // Get user settings
    const { data: settings } = await supabase
      .from('settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const postsPerWeek = settings?.posts_per_week || 2;
    const targetPosts = postsPerWeek * 2; // 14 days = 2 weeks

    // Count scheduled posts in next 14 days
    const now = new Date();
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const { data: scheduledPosts } = await supabase
      .from('posts')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['SCHEDULED', 'APPROVED', 'READY_FOR_REVIEW'])
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in14Days.toISOString());

    const currentCount = scheduledPosts?.length || 0;
    const draftsNeeded = Math.max(0, targetPosts - currentCount);

    if (draftsNeeded === 0) {
      return new Response(JSON.stringify({ draftsCreated: 0, message: 'Target already met' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get available topics
    const { data: topics } = await supabase
      .from('topics')
      .select('*')
      .eq('user_id', user.id)
      .order('priority', { ascending: false });

    if (!topics || topics.length === 0) {
      return new Response(JSON.stringify({ draftsCreated: 0, message: 'No topics available' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate drafts by calling generate-draft function
    let draftsCreated = 0;
    for (let i = 0; i < Math.min(draftsNeeded, 5); i++) { // Max 5 per run
      const topic = topics[i % topics.length];
      
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/generate-draft`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ topic_id: topic.id }),
        });

        if (response.ok) {
          draftsCreated++;
        }
      } catch (e) {
        console.error('Failed to generate draft:', e);
      }
    }

    await supabase.from('logs').insert({
      user_id: user.id,
      event_type: 'autopilot_fill',
      level: 'info',
      details: { drafts_created: draftsCreated, target: targetPosts, current: currentCount },
    });

    return new Response(JSON.stringify({ draftsCreated, targetPosts, currentCount }), {
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
