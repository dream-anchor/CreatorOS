import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Post type structures for the wizard
const POST_TYPE_PROMPTS: Record<string, { name: string; instruction: string; isCarousel?: boolean }> = {
  behind_scenes: {
    name: "Set-Leben / Behind the Scenes",
    instruction: `Erstelle einen authentischen Behind-the-Scenes Post.
STRUKTUR: Persönlicher Einblick → Was passiert gerade → Emotion/Reaktion → Frage an Community
STIL: Nahbar, echt, nicht zu poliert. Als würde man einem Freund erzählen.
HOOK: Muss Neugier wecken - was passiert hinter den Kulissen?`
  },
  thoughts: {
    name: "Gedanken / Reflexion",
    instruction: `Erstelle einen tiefgründigen, nachdenklichen Post.
STRUKTUR: Starkes Statement → Kontext/Geschichte → Lesson Learned → Call-to-Action
STIL: Reflektiert, persönlich, verletzlich aber nicht dramatisch.
HOOK: Eine unerwartete Erkenntnis oder kontroverses Statement.`
  },
  humor: {
    name: "Humor / Entertainment",
    instruction: `Erstelle einen lustigen, unterhaltsamen Post.
STRUKTUR: Witziger Hook → Setup → Punchline → Emoji-reicher Abschluss
STIL: Selbstironisch, witzig, relatable. Kurze Sätze für Comedy-Timing.
HOOK: Überraschender Einstieg oder relatable Situation.`
  },
  motivation: {
    name: "Motivation / Inspiration",
    instruction: `Erstelle einen motivierenden, inspirierenden Post.
STRUKTUR: Empowering Statement → Persönliche Erfahrung → Ermutigung → Aufruf
STIL: Aufbauend, authentisch (nicht cheesy), mit echtem Beispiel.
HOOK: Kraftvolles Statement das Hoffnung gibt.`
  },
  tips: {
    name: "Tipps & Tricks",
    instruction: `Erstelle einen informativen Carousel-Post mit 5 Slides.
STRUKTUR:
- Slide 1: Titel/Hook (aufmerksamkeitsstark, neugierig machend)
- Slide 2-4: Haupttipps (je 1 konkreter, actionabler Tipp)
- Slide 5: Call to Action (Speichern, Folgen, Teilen)
STIL: Klar, strukturiert, visuell scanbar. Kurze Bullet Points.`,
    isCarousel: true
  },
  storytelling: {
    name: "Storytelling / Carousel",
    instruction: `Erstelle einen fesselnden Storytelling-Carousel mit 5 Slides.
STRUKTUR:
- Slide 1: Hook/Teaser der Geschichte
- Slide 2: Setup - Kontext & Situation
- Slide 3: Konflikt/Wendepunkt
- Slide 4: Auflösung/Lesson
- Slide 5: Call to Action
STIL: Emotional, spannend, persönlich. Cliffhanger zwischen Slides.`,
    isCarousel: true
  },
  announcement: {
    name: "Ankündigung / News",
    instruction: `Erstelle einen aufregenden Ankündigungs-Post.
STRUKTUR: Teaser/Excitement → Die große News → Details → Was kommt als nächstes
STIL: Enthusiastisch aber nicht übertrieben, Spannung aufbauen.
HOOK: Etwas Großes steht bevor - Neugier wecken.`
  },
  remix: {
    name: "Remix & Remaster",
    instruction: `Du analysierst einen erfolgreichen alten Post und erstellst eine komplett neue Version.
DEINE AUFGABE:
1. Analysiere WARUM der originale Post erfolgreich war (Muster erkennen)
2. Extrahiere den KERN-WERT (was hat die Zielgruppe angesprochen?)
3. Transformiere das Konzept in ein NEUES Format
4. Erstelle 3 geschärfte, moderne Hooks
5. Behalte die Persönlichkeit, aber mach alles FRISCH

WICHTIG: NICHT KOPIEREN - TRANSFORMIEREN!`
  }
};

// Calculate virality score
function calculateViralityScore(post: any): number {
  const likes = post.likes_count || 0;
  const comments = post.comments_count || 0;
  const saved = post.saved_count || 0;
  const impressions = post.impressions_count || 0;
  
  // Score = Likes*1 + Comments*3 + Saved*2 + Impressions*0.01
  return likes + (comments * 3) + (saved * 2) + (impressions * 0.01);
}

// Get performance label based on metrics
function getPerformanceLabel(post: any): string {
  const comments = post.comments_count || 0;
  const likes = post.likes_count || 0;
  const saved = post.saved_count || 0;
  
  // Calculate engagement ratios
  const commentRatio = likes > 0 ? comments / likes : 0;
  const saveRatio = likes > 0 ? saved / likes : 0;
  
  if (commentRatio > 0.15) return 'discussion_starter'; // High comment ratio
  if (saveRatio > 0.1) return 'high_value'; // High save ratio means valuable content
  if (likes > 500) return 'viral_hit';
  return 'high_engagement';
}

// Helper to find matching media from archive
async function findMatchingMedia(supabase: any, userId: string, tags: string[], mood: string | null) {
  console.log(`Looking for media with tags: ${tags.join(', ')}, mood: ${mood}`);
  
  let query = supabase
    .from('media_assets')
    .select('*')
    .eq('user_id', userId)
    .order('used_count', { ascending: true })
    .order('created_at', { ascending: false });

  const { data: allMedia } = await query;
  
  if (!allMedia || allMedia.length === 0) {
    console.log('No media found in archive');
    return null;
  }

  const scored = allMedia.map((media: any) => {
    let score = 0;
    const mediaTags = media.tags || [];
    
    for (const tag of tags) {
      if (mediaTags.some((t: string) => t.toLowerCase().includes(tag.toLowerCase()))) {
        score += 10;
      }
    }
    
    if (mood && media.mood && media.mood.toLowerCase() === mood.toLowerCase()) {
      score += 15;
    }
    
    if (media.used_count === 0) score += 20;
    else if (media.used_count < 3) score += 5;
    
    return { ...media, score };
  });

  scored.sort((a: any, b: any) => b.score - a.score);
  
  const topCandidates = scored.filter((m: any) => m.score > 0).slice(0, 3);
  
  if (topCandidates.length > 0) {
    const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    console.log(`Selected media: ${selected.id} with score ${selected.score}`);
    return selected;
  }
  
  const unused = scored.filter((m: any) => m.used_count === 0);
  if (unused.length > 0) {
    const selected = unused[Math.floor(Math.random() * unused.length)];
    console.log(`Fallback to unused media: ${selected.id}`);
    return selected;
  }
  
  console.log(`Using least used media: ${scored[0].id}`);
  return scored[0];
}

// Generate AI image
async function generateAIImage(lovableApiKey: string, prompt: string): Promise<string | null> {
  console.log(`Generating AI image with prompt: ${prompt.substring(0, 100)}...`);
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      console.error('Image generation failed:', await response.text());
      return null;
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (imageUrl) {
      console.log('AI image generated successfully');
      return imageUrl;
    }
    
    return null;
  } catch (error) {
    console.error('Error generating AI image:', error);
    return null;
  }
}

// Upload base64 image to storage
async function uploadBase64Image(supabase: any, userId: string, base64Data: string, postId: string): Promise<string | null> {
  try {
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
    
    const fileName = `${userId}/generated/${postId}-${Date.now()}.png`;
    
    const { error: uploadError } = await supabase.storage
      .from('media-archive')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('media-archive')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
}

// Get top performing posts for remix
async function getTopPerformingPosts(supabase: any, userId: string, limit: number = 10) {
  const { data: posts, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_imported', true)
    .eq('status', 'PUBLISHED')
    .not('caption', 'is', null);

  if (error || !posts || posts.length === 0) {
    console.log('No imported posts found for remix');
    return [];
  }

  // Calculate virality score for each post
  const scoredPosts = posts.map((post: any) => ({
    ...post,
    virality_score: calculateViralityScore(post),
    performance_label: getPerformanceLabel(post)
  }));

  // Sort by virality score and get top performers
  scoredPosts.sort((a: any, b: any) => b.virality_score - a.virality_score);
  
  // Get top 1% (or at least top 3)
  const topCount = Math.max(3, Math.ceil(scoredPosts.length * 0.01));
  return scoredPosts.slice(0, Math.min(limit, topCount));
}

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

    const { 
      topic_id, 
      post_type, 
      additional_context, 
      force_carousel,
      // Remix mode parameters
      remix_mode,
      remix_post_id,
      get_remix_candidates
    } = await req.json();

    // If requesting remix candidates, return top performing posts
    if (get_remix_candidates) {
      const topPosts = await getTopPerformingPosts(supabase, user.id, 10);
      return new Response(JSON.stringify({ candidates: topPosts }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For remix mode without topic_id
    if (remix_mode && remix_post_id) {
      return await handleRemixMode(supabase, user, remix_post_id, lovableApiKey);
    }

    if (!topic_id) throw new Error('topic_id required');

    const postTypeInfo = post_type && POST_TYPE_PROMPTS[post_type] ? POST_TYPE_PROMPTS[post_type] : null;
    const isCarousel = force_carousel || postTypeInfo?.isCarousel || false;
    
    console.log(`Generating ${isCarousel ? 'carousel' : 'single'} draft for topic ${topic_id}, type: ${post_type || 'default'}`);

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

    // Build prompt components
    const tabooWords = brand?.taboo_words?.length > 0 
      ? `- Tabu-Wörter (NIEMALS verwenden): ${brand.taboo_words.join(', ')}` 
      : '';
    const writingStyle = brand?.writing_style ? `- Schreibstil: ${brand.writing_style}` : '';
    const examplePosts = brand?.example_posts ? `\n\nBEISPIEL-POSTS:\n${brand.example_posts}` : '';
    const postTypeInstructions = postTypeInfo ? `\n\nPOST-TYP: ${postTypeInfo.name}\n${postTypeInfo.instruction}` : '';
    const contextSection = additional_context ? `\n\nZUSÄTZLICHER KONTEXT:\n${additional_context}` : '';
    const styleSystemPrompt = brand?.style_system_prompt ? `\n\nSTIL-INSTRUKTION:\n${brand.style_system_prompt}` : '';

    // Different output format for carousel vs single
    const outputFormat = isCarousel ? `{
  "slides": [
    { "slide_number": 1, "type": "hook", "headline": "Titel", "body": "Kurzer Hook-Text" },
    { "slide_number": 2, "type": "content", "headline": "Punkt 1", "body": "Erklärung" },
    { "slide_number": 3, "type": "content", "headline": "Punkt 2", "body": "Erklärung" },
    { "slide_number": 4, "type": "content", "headline": "Punkt 3", "body": "Erklärung" },
    { "slide_number": 5, "type": "cta", "headline": "Call to Action", "body": "Speichern & Folgen!" }
  ],
  "caption": "Caption für den Post",
  "hashtags": "#hashtag1 #hashtag2",
  "alt_text": "Bildbeschreibung",
  "suggested_tags": ["tag1", "tag2"],
  "mood": "Energetisch|Nachdenklich|Fröhlich"
}` : `{
  "caption": "Vollständige Caption mit Hook, Haupttext und Call-to-Action",
  "caption_alt": "Alternative kürzere Version",
  "caption_short": "Sehr kurze Story-Version",
  "hashtags": "#hashtag1 #hashtag2",
  "alt_text": "Bildbeschreibung für Barrierefreiheit",
  "asset_prompt": "English prompt for cinematic mood image WITHOUT people, film noir style, dramatic lighting",
  "suggested_tags": ["Portrait", "Set", "Lifestyle"],
  "mood": "Energetisch|Nachdenklich|Fröhlich"
}`;

    const systemPrompt = `Du bist ein professioneller Instagram Content Creator für den deutschen Markt.
Erstelle ${isCarousel ? 'einen Carousel-Post mit 5 Slides' : 'einen Instagram-Post'} basierend auf dem Thema.
${styleSystemPrompt}
${postTypeInstructions}

Brand Guidelines:
- Tonalität: ${brand?.tone_style || 'Professionell und nahbar'}
${writingStyle}
- Sprache: ${brand?.language_primary || 'DE'}
- Emoji-Level: ${brand?.emoji_level || 1}
- Hashtags: ${brand?.hashtag_min || 8}-${brand?.hashtag_max || 20}
${tabooWords}
${examplePosts}

WICHTIG für Bildauswahl:
- Wähle passende Tags aus: Portrait, Set, Behind the Scenes, Lifestyle, Outdoor, Studio, Mood, Urlaub, Event, Produkt
- Bestimme die Stimmung: Energetisch, Nachdenklich, Fröhlich, Mysteriös, Professionell, Entspannt, Dramatisch

Antworte AUSSCHLIESSLICH mit validem JSON:
${outputFormat}`;

    const userPrompt = `Thema: ${topic.title}
Beschreibung: ${topic.description || 'Keine'}
Keywords: ${topic.keywords?.join(', ') || 'Keine'}${contextSection}`;

    const selectedModel = brand?.ai_model || 'google/gemini-2.5-flash';
    console.log(`Using AI model: ${selectedModel}`);

    // Generate text content
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      if (aiResponse.status === 429) throw new Error('Rate limit erreicht. Bitte warte einen Moment.');
      if (aiResponse.status === 402) throw new Error('Credits aufgebraucht.');
      throw new Error('AI generation failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');
    
    const draft = JSON.parse(jsonMatch[0]);

    // Create the post
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        topic_id: topic.id,
        status: 'READY_FOR_REVIEW',
        caption: draft.caption,
        caption_alt: draft.caption_alt || null,
        caption_short: draft.caption_short || null,
        hashtags: draft.hashtags,
        alt_text: draft.alt_text,
        format: isCarousel ? 'carousel' : 'single',
        slides: isCarousel ? draft.slides : null,
      })
      .select()
      .single();

    if (postError) throw postError;

    // Handle image selection/generation
    let assetUrl: string | null = null;
    let assetSource: 'archive' | 'generated' = 'archive';

    const suggestedTags = draft.suggested_tags || ['Lifestyle'];
    const suggestedMood = draft.mood || null;
    
    const matchingMedia = await findMatchingMedia(supabase, user.id, suggestedTags, suggestedMood);

    if (matchingMedia && matchingMedia.public_url) {
      console.log('Using media from archive');
      assetUrl = matchingMedia.public_url;
      assetSource = 'archive';
      
      await supabase
        .from('media_assets')
        .update({ 
          used_count: (matchingMedia.used_count || 0) + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', matchingMedia.id);
    } else if (draft.asset_prompt) {
      console.log('Generating AI image...');
      const imagePrompt = `Create a photorealistic, cinematic image for Instagram: ${draft.asset_prompt}. 
Style: Film noir lighting, atmospheric, moody. 
IMPORTANT: NO people, NO faces, NO human figures. 
Focus on environment, objects, atmosphere, textures. 
16:9 aspect ratio, high quality, Instagram-ready.`;

      const base64Image = await generateAIImage(lovableApiKey, imagePrompt);
      
      if (base64Image) {
        assetUrl = await uploadBase64Image(supabase, user.id, base64Image, post.id);
        assetSource = 'generated';
      }
    }

    // Create asset entry
    if (assetUrl) {
      await supabase.from('assets').insert({
        user_id: user.id,
        post_id: post.id,
        storage_path: assetUrl,
        public_url: assetUrl,
        source: assetSource === 'generated' ? 'generate' : 'upload',
      });
    }

    // For carousels, create slide assets
    if (isCarousel && draft.slides) {
      for (const slide of draft.slides) {
        await supabase.from('slide_assets').insert({
          user_id: user.id,
          post_id: post.id,
          slide_index: slide.slide_number,
          generated_text: JSON.stringify(slide),
          asset_type: 'text',
        });
      }
    }

    // Log
    await supabase.from('logs').insert({
      user_id: user.id,
      post_id: post.id,
      event_type: 'draft_generated',
      level: 'info',
      details: { 
        topic_id, 
        model: selectedModel,
        post_type: post_type || 'default',
        format: isCarousel ? 'carousel' : 'single',
        slide_count: isCarousel ? draft.slides?.length : 1,
        asset_source: assetSource,
        has_image: !!assetUrl
      },
    });

    return new Response(JSON.stringify({ 
      draft, 
      post,
      asset_url: assetUrl,
      asset_source: assetSource
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

// Handle Remix Mode
async function handleRemixMode(supabase: any, user: any, remixPostId: string, lovableApiKey: string) {
  console.log(`Remix mode for post ${remixPostId}`);
  
  // Get the original post
  const { data: originalPost, error: postError } = await supabase
    .from('posts')
    .select('*')
    .eq('id', remixPostId)
    .eq('user_id', user.id)
    .single();

  if (postError || !originalPost) {
    throw new Error('Original post not found');
  }

  // Get brand rules
  const { data: brand } = await supabase
    .from('brand_rules')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const viralityScore = calculateViralityScore(originalPost);
  const performanceLabel = getPerformanceLabel(originalPost);

  // Determine if we should flip the format
  const originalFormat = originalPost.format || 'single';
  const shouldFlipFormat = originalFormat === 'single'; // If single, suggest carousel
  const newFormat = shouldFlipFormat ? 'carousel' : 'single';

  // Build the remaster prompt
  const remasterSystemPrompt = `Du bist ein Elite Content Strategist und musst einen viralen Post "remastern".

ORIGINALER POST (Virality Score: ${viralityScore.toFixed(0)}, Label: ${performanceLabel}):
"""
${originalPost.caption || 'Kein Text'}
"""

ENGAGEMENT DATEN:
- Likes: ${originalPost.likes_count || 0}
- Kommentare: ${originalPost.comments_count || 0}
- Gespeichert: ${originalPost.saved_count || 0}
- Impressionen: ${originalPost.impressions_count || 0}

DEINE AUFGABE - CONTENT REMASTERING:

1. ANALYSE: Warum war dieser Post erfolgreich?
   - Identifiziere das Erfolgsrezept (provokante These? Nutzwert? Humor? Emotional?)
   - Was hat die Community angesprochen?

2. FORMAT-FLIP: Der originale Post war ein ${originalFormat === 'single' ? 'Einzelbild' : 'Carousel'}.
   Erstelle jetzt ${newFormat === 'carousel' ? 'ein 5-Slide Carousel' : 'einen Single-Post'}.
   ${newFormat === 'carousel' ? 'Erweitere das Thema in 5 strukturierte Slides.' : 'Kondensiere die Essenz in einen kraftvollen Single-Post.'}

3. HOOK-UPDATE: Erstelle 3 KOMPLETT NEUE, geschärfte Hooks für 2024.
   - Moderner, schärfer, aufmerksamkeitsstärker
   - Nutze aktuelle Instagram-Trends

4. VIBE-CHECK: Behalte die Persönlichkeit/Tone of Voice, aber mach alles FRISCH.

Brand Guidelines:
- Tonalität: ${brand?.tone_style || 'Professionell und nahbar'}
- Schreibstil: ${brand?.writing_style || 'Authentisch'}
- Sprache: ${brand?.language_primary || 'DE'}
- Emoji-Level: ${brand?.emoji_level || 1}

Antworte mit diesem JSON:
{
  "original_analysis": "1-2 Sätze warum der Post viral ging",
  "format_flip_reason": "Warum das neue Format besser passt",
  "new_hooks": ["Hook 1", "Hook 2", "Hook 3"],
  "reuse_original_image": true/false,
  ${newFormat === 'carousel' ? `"slides": [
    { "slide_number": 1, "type": "hook", "headline": "...", "body": "..." },
    { "slide_number": 2, "type": "content", "headline": "...", "body": "..." },
    { "slide_number": 3, "type": "content", "headline": "...", "body": "..." },
    { "slide_number": 4, "type": "content", "headline": "...", "body": "..." },
    { "slide_number": 5, "type": "cta", "headline": "...", "body": "..." }
  ],` : ''}
  "caption": "Neue Caption mit dem besten Hook",
  "caption_alt": "Alternative Version",
  "hashtags": "#relevant #hashtags",
  "alt_text": "Bildbeschreibung",
  "asset_prompt": "English prompt for new image if needed",
  "suggested_tags": ["tag1", "tag2"],
  "mood": "Stimmung"
}`;

  const selectedModel = brand?.ai_model || 'google/gemini-2.5-flash';

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [
        { role: 'system', content: remasterSystemPrompt },
        { role: 'user', content: 'Remaster diesen Post jetzt.' }
      ],
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    console.error('AI API error:', errorText);
    if (aiResponse.status === 429) throw new Error('Rate limit erreicht.');
    if (aiResponse.status === 402) throw new Error('Credits aufgebraucht.');
    throw new Error('AI generation failed');
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid AI response format');
  
  const draft = JSON.parse(jsonMatch[0]);
  const isCarousel = newFormat === 'carousel';

  // Create new post with remix tracking
  const { data: post, error: createError } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      topic_id: originalPost.topic_id,
      status: 'READY_FOR_REVIEW',
      caption: draft.caption,
      caption_alt: draft.caption_alt || null,
      hashtags: draft.hashtags,
      alt_text: draft.alt_text,
      format: newFormat,
      slides: isCarousel ? draft.slides : null,
      remixed_from_id: remixPostId,
      remix_reason: draft.original_analysis,
    })
    .select()
    .single();

  if (createError) throw createError;

  // Handle image logic
  let assetUrl: string | null = null;
  let assetSource: 'archive' | 'generated' | 'original' = 'archive';

  if (draft.reuse_original_image && originalPost.original_media_url) {
    // Reuse original image
    console.log('Reusing original image');
    assetUrl = originalPost.original_media_url;
    assetSource = 'original';
  } else {
    // Try media archive or generate new
    const suggestedTags = draft.suggested_tags || ['Lifestyle'];
    const suggestedMood = draft.mood || null;
    
    const matchingMedia = await findMatchingMedia(supabase, user.id, suggestedTags, suggestedMood);

    if (matchingMedia && matchingMedia.public_url) {
      assetUrl = matchingMedia.public_url;
      assetSource = 'archive';
      
      await supabase
        .from('media_assets')
        .update({ 
          used_count: (matchingMedia.used_count || 0) + 1,
          last_used_at: new Date().toISOString()
        })
        .eq('id', matchingMedia.id);
    } else if (draft.asset_prompt) {
      const imagePrompt = `Create a photorealistic, cinematic image for Instagram: ${draft.asset_prompt}. 
Style: Film noir lighting, atmospheric, moody. 
IMPORTANT: NO people, NO faces, NO human figures. 
16:9 aspect ratio, high quality, Instagram-ready.`;

      const base64Image = await generateAIImage(lovableApiKey, imagePrompt);
      
      if (base64Image) {
        assetUrl = await uploadBase64Image(supabase, user.id, base64Image, post.id);
        assetSource = 'generated';
      }
    }
  }

  // Create asset entry
  if (assetUrl) {
    await supabase.from('assets').insert({
      user_id: user.id,
      post_id: post.id,
      storage_path: assetUrl,
      public_url: assetUrl,
      source: assetSource === 'generated' ? 'generate' : 'upload',
    });
  }

  // For carousels, create slide assets
  if (isCarousel && draft.slides) {
    for (const slide of draft.slides) {
      await supabase.from('slide_assets').insert({
        user_id: user.id,
        post_id: post.id,
        slide_index: slide.slide_number,
        generated_text: JSON.stringify(slide),
        asset_type: 'text',
      });
    }
  }

  // Log
  await supabase.from('logs').insert({
    user_id: user.id,
    post_id: post.id,
    event_type: 'draft_remixed',
    level: 'info',
    details: { 
      original_post_id: remixPostId,
      original_virality_score: viralityScore,
      performance_label: performanceLabel,
      format_flip: `${originalFormat} -> ${newFormat}`,
      asset_source: assetSource,
      reused_original: draft.reuse_original_image
    },
  });

  return new Response(JSON.stringify({ 
    draft: {
      ...draft,
      hook_options: draft.new_hooks,
    },
    post,
    asset_url: assetUrl,
    asset_source: assetSource,
    remix_info: {
      original_post_id: remixPostId,
      virality_score: viralityScore,
      performance_label: performanceLabel,
      original_analysis: draft.original_analysis,
      format_flip_reason: draft.format_flip_reason,
      new_hooks: draft.new_hooks,
    }
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
