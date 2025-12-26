import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Content pillar mapping for days of the week
const DAY_PILLARS: Record<number, string> = {
  0: 'Reflexion', // Sunday
  1: 'Motivation', // Monday
  2: 'Set-Leben', // Tuesday
  3: 'Frage an Community', // Wednesday
  4: 'Behind the Scenes', // Thursday
  5: 'Humor', // Friday
  6: 'Persönliches', // Saturday
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    console.log('Starting autopilot-fill for user:', user.id);

    // Get user's brand rules for content pillars
    const { data: brandRules } = await supabase
      .from('brand_rules')
      .select('content_pillars, style_system_prompt, tone_style, language_primary')
      .eq('user_id', user.id)
      .single();

    // Get user topics
    const { data: topics } = await supabase
      .from('topics')
      .select('*')
      .eq('user_id', user.id)
      .order('priority', { ascending: false });

    // Get available media assets (unused or least used images from "Meine Bilder")
    const { data: mediaAssets } = await supabase
      .from('media_assets')
      .select('*')
      .eq('user_id', user.id)
      .order('used_count', { ascending: true })
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .limit(20);

    console.log('Found media assets:', mediaAssets?.length || 0);
    console.log('Found topics:', topics?.length || 0);

    // Warn if no images available
    const hasImages = mediaAssets && mediaAssets.length > 0;

    // Check next 7 days for gaps
    const now = new Date();
    const daysToCheck = 7;
    const gaps: Date[] = [];

    for (let i = 1; i <= daysToCheck; i++) {
      const checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() + i);
      checkDate.setHours(10, 0, 0, 0); // Default to 10 AM
      
      const startOfDay = new Date(checkDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(checkDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Check if there's already a post scheduled for this day
      const { data: existingPosts } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['SCHEDULED', 'APPROVED', 'READY_FOR_REVIEW'])
        .gte('scheduled_at', startOfDay.toISOString())
        .lte('scheduled_at', endOfDay.toISOString());

      if (!existingPosts || existingPosts.length === 0) {
        gaps.push(checkDate);
      }
    }

    console.log('Found gaps:', gaps.length);

    if (gaps.length === 0) {
      return new Response(JSON.stringify({ 
        draftsCreated: 0, 
        message: 'Keine Lücken in den nächsten 7 Tagen' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate drafts for each gap
    let draftsCreated = 0;
    const maxDrafts = Math.min(gaps.length, 5); // Max 5 per run

    for (let i = 0; i < maxDrafts; i++) {
      const gapDate = gaps[i];
      const dayOfWeek = gapDate.getDay();
      const pillar = DAY_PILLARS[dayOfWeek];
      
      // Pick a topic that matches the pillar or random one
      let selectedTopic = topics?.find(t => 
        t.title.toLowerCase().includes(pillar.toLowerCase()) ||
        t.description?.toLowerCase().includes(pillar.toLowerCase())
      );
      
      if (!selectedTopic && topics && topics.length > 0) {
        selectedTopic = topics[i % topics.length];
      }

      // Pick a random image from media library if available
      const selectedImage = hasImages 
        ? mediaAssets[Math.floor(Math.random() * mediaAssets.length)]
        : null;

      try {
        // Generate caption using AI
        let caption = `[${pillar}] `;
        let hashtags = '#content #creator';

        if (lovableApiKey) {
          const systemPrompt = brandRules?.style_system_prompt || 
            `Du bist ein Social Media Redakteur. Schreibe authentische, emotionale Instagram-Captions.
            Stil: ${brandRules?.tone_style || 'casual, authentisch'}
            Sprache: ${brandRules?.language_primary || 'DE'}`;

          const userPrompt = `Erstelle eine Instagram-Caption zum Thema "${pillar}"${selectedTopic ? ` mit Fokus auf: ${selectedTopic.title}` : ''}.
          
Die Caption soll:
- Einen starken Hook in der ersten Zeile haben
- Authentisch und persönlich klingen
- Maximal 2200 Zeichen lang sein
- 8-15 relevante Hashtags am Ende haben

Format deine Antwort als JSON:
{
  "caption": "Die Caption...",
  "hashtags": "#hashtag1 #hashtag2 ..."
}`;

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
                { role: 'user', content: userPrompt },
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.choices?.[0]?.message?.content || '';
            
            try {
              // Try to parse as JSON
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                caption = parsed.caption || caption;
                hashtags = parsed.hashtags || hashtags;
              } else {
                caption = content;
              }
            } catch {
              caption = content;
            }
          }
        }

        // Create the post with image URL if available
        const { data: newPost, error: postError } = await supabase
          .from('posts')
          .insert({
            user_id: user.id,
            caption: caption,
            hashtags: hashtags,
            status: 'READY_FOR_REVIEW',
            scheduled_at: gapDate.toISOString(),
            topic_id: selectedTopic?.id || null,
            original_media_url: selectedImage?.public_url || null,
          })
          .select()
          .single();

        if (postError) {
          console.error('Failed to create post:', postError);
          continue;
        }

        // If we have an image, also create an asset record for proper display
        if (selectedImage && newPost) {
          await supabase.from('assets').insert({
            user_id: user.id,
            post_id: newPost.id,
            storage_path: selectedImage.storage_path,
            public_url: selectedImage.public_url,
            source: 'upload',
          });

          // Update media asset usage counter
          await supabase
            .from('media_assets')
            .update({
              used_count: (selectedImage.used_count || 0) + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq('id', selectedImage.id);
          
          console.log(`Attached image to post: ${selectedImage.filename || selectedImage.id}`);
        }

        draftsCreated++;
        console.log(`Created draft for ${gapDate.toDateString()}: ${pillar}`);
      } catch (e) {
        console.error('Failed to generate draft:', e);
      }
    }

    // Log the operation
    await supabase.from('logs').insert({
      user_id: user.id,
      event_type: 'autopilot_fill',
      level: 'info',
      details: { 
        drafts_created: draftsCreated, 
        gaps_found: gaps.length,
        images_available: mediaAssets?.length || 0,
        warning: !hasImages ? 'Keine Bilder im Archiv gefunden' : null,
      },
    });

    return new Response(JSON.stringify({ 
      draftsCreated, 
      gapsFound: gaps.length,
      imagesAttached: hasImages,
      message: `${draftsCreated} Entwürfe erstellt${!hasImages ? ' (⚠️ Keine Bilder im Archiv)' : ''}`
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
