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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { topic_id } = await req.json();
    if (!topic_id) throw new Error('topic_id required');

    // Load topic
    const { data: topic, error: topicError } = await supabase
      .from('topics')
      .select('*')
      .eq('id', topic_id)
      .eq('user_id', user.id)
      .single();
    if (topicError) throw topicError;

    // Load brand rules
    const { data: brand } = await supabase
      .from('brand_rules')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const systemPrompt = `Du bist ein professioneller Instagram Content Creator für den deutschen Markt.
Erstelle einen Instagram-Post basierend auf dem gegebenen Thema.

Brand Guidelines:
- Tonalität: ${brand?.tone_style || 'Professionell und nahbar'}
- Sprache: ${brand?.language_primary || 'DE'}
- Emoji-Level: ${brand?.emoji_level || 1} (0=keine, 3=viele)
- Hashtags: ${brand?.hashtag_min || 8}-${brand?.hashtag_max || 20}
- Do's: ${brand?.do_list?.join(', ') || 'Keine spezifischen'}
- Don'ts: ${brand?.dont_list?.join(', ') || 'Keine spezifischen'}
${brand?.disclaimers ? `- Disclaimer: ${brand.disclaimers}` : ''}

Antworte AUSSCHLIESSLICH mit validem JSON im folgenden Format:
{
  "hook_options": ["Hook 1", "Hook 2", "Hook 3"],
  "caption": "Vollständige Caption mit Hook, Haupttext und Call-to-Action",
  "caption_alt": "Alternative kürzere Version",
  "caption_short": "Sehr kurze Story-Version",
  "hashtags": "#hashtag1 #hashtag2 ...",
  "alt_text": "Bildbeschreibung für Barrierefreiheit",
  "asset_prompt": "Englischer Prompt für Bildgenerierung",
  "format": "single"
}`;

    const userPrompt = `Thema: ${topic.title}
Beschreibung: ${topic.description || 'Keine'}
Keywords: ${topic.keywords?.join(', ') || 'Keine'}
Priorität: ${topic.priority}/5
Evergreen: ${topic.evergreen ? 'Ja' : 'Nein'}`;

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('AI generation failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');
    
    const draft = JSON.parse(jsonMatch[0]);

    // Validate hashtag count
    const hashtagCount = (draft.hashtags?.match(/#/g) || []).length;
    const minTags = brand?.hashtag_min || 8;
    const maxTags = brand?.hashtag_max || 20;
    
    if (hashtagCount < minTags || hashtagCount > maxTags) {
      console.warn(`Hashtag count ${hashtagCount} outside range ${minTags}-${maxTags}`);
    }

    // Create post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        topic_id: topic.id,
        status: 'READY_FOR_REVIEW',
        caption: draft.caption,
        caption_alt: draft.caption_alt,
        caption_short: draft.caption_short,
        hashtags: draft.hashtags,
        alt_text: draft.alt_text,
        format: 'single',
      })
      .select()
      .single();

    if (postError) throw postError;

    // Log
    await supabase.from('logs').insert({
      user_id: user.id,
      post_id: post.id,
      event_type: 'draft_generated',
      level: 'info',
      details: { topic_id, hashtag_count: hashtagCount },
    });

    return new Response(JSON.stringify({ draft, post }), {
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
