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

    console.log(`Starting style analysis for user ${user.id}`);

    // Get Instagram connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (connError || !connection) {
      throw new Error('Keine Instagram-Verbindung gefunden. Bitte verbinde zuerst deinen Account.');
    }

    if (!connection.token_encrypted || !connection.ig_user_id) {
      throw new Error('Instagram-Token fehlt. Bitte verbinde deinen Account erneut.');
    }

    const accessToken = connection.token_encrypted;
    const igUserId = connection.ig_user_id;

    console.log(`Fetching media for IG user ${igUserId}`);

    // Fetch last 20 posts from Instagram Graph API
    const mediaUrl = `https://graph.facebook.com/v17.0/${igUserId}/media?fields=id,caption,timestamp,like_count,comments_count,media_type&limit=20&access_token=${accessToken}`;
    
    const mediaResponse = await fetch(mediaUrl);
    
    if (!mediaResponse.ok) {
      const errorData = await mediaResponse.json();
      console.error('Instagram API error:', errorData);
      throw new Error(`Instagram API Fehler: ${errorData.error?.message || 'Unbekannter Fehler'}`);
    }

    const mediaData = await mediaResponse.json();
    const posts = mediaData.data || [];

    console.log(`Found ${posts.length} posts`);

    if (posts.length === 0) {
      throw new Error('Keine Posts gefunden. Bitte stelle sicher, dass dein Account Posts hat.');
    }

    // Filter posts with captions and prepare analysis data
    const postsWithCaptions = posts.filter((post: any) => post.caption && post.caption.trim());
    
    if (postsWithCaptions.length < 3) {
      throw new Error('Zu wenige Posts mit Captions gefunden. Mindestens 3 werden benötigt.');
    }

    // Prepare posts data for AI analysis
    const postsForAnalysis = postsWithCaptions.map((post: any, index: number) => ({
      number: index + 1,
      caption: post.caption,
      likes: post.like_count || 0,
      comments: post.comments_count || 0,
      date: post.timestamp,
      engagement: (post.like_count || 0) + (post.comments_count || 0)
    }));

    // Sort by engagement to identify top performers
    const topPerformers = [...postsForAnalysis]
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5);

    console.log(`Analyzing ${postsForAnalysis.length} posts, top 5 by engagement identified`);

    // Build the analysis prompt
    const postsText = postsForAnalysis
      .map((p: any) => `Post ${p.number} (${p.likes} Likes, ${p.comments} Kommentare):\n"${p.caption}"`)
      .join('\n\n---\n\n');

    const topPerformersText = topPerformers
      .map((p: any) => `"${p.caption}" (${p.engagement} Interaktionen)`)
      .join('\n\n');

    const analysisPrompt = `Analysiere den Schreibstil dieses Instagram-Autors anhand seiner letzten ${postsForAnalysis.length} Posts.

POSTS ZUR ANALYSE:
${postsText}

TOP 5 POSTS NACH ENGAGEMENT:
${topPerformersText}

ANALYSIERE FOLGENDE ASPEKTE:

1. SATZSTRUKTUR
- Wie beginnt der Autor typischerweise Sätze?
- Nutzt er kurze oder lange Sätze?
- Gibt es wiederkehrende Satzanfänge?

2. TONALITÄT
- Ist der Ton humorvoll, sarkastisch, ernst, motivierend?
- Wie persönlich/verletzlich ist der Stil?
- Gibt es eine erkennbare "Stimme"?

3. FORMATIERUNG
- Emoji-Nutzung (häufig, selten, welche Art?)
- Absätze und Struktur
- Hashtag-Stil

4. ENGAGEMENT-MUSTER
- Was haben die Top-Posts gemeinsam?
- Welche Elemente funktionieren besonders gut?

5. EINZIGARTIGE MERKMALE
- Gibt es Catchphrases oder wiederkehrende Formulierungen?
- Besonderheiten im Ausdruck?

ERSTELLE DARAUS:

A) Eine kompakte Stil-Beschreibung (2-3 Sätze)

B) Eine Liste von Do's (was der Autor immer tut)

C) Eine Liste von Don'ts (was der Autor nie tut)

D) Beispiel-Posts die den Stil perfekt repräsentieren (wähle 2-3 aus den analysierten)

E) Einen Schreibstil-String (kurz, z.B. "Selbstironisch, kurze Sätze, viele Emojis, direkte Ansprache")

F) Ein empfohlenes Emoji-Level (0-3)

Antworte NUR mit validem JSON in diesem Format:
{
  "style_description": "Kompakte Stil-Beschreibung...",
  "writing_style": "Kurzer Schreibstil-String",
  "do_list": ["Do 1", "Do 2", "Do 3"],
  "dont_list": ["Don't 1", "Don't 2"],
  "example_posts": "Beispiel 1:\\n---\\nBeispiel 2:\\n---\\nBeispiel 3:",
  "emoji_level": 2,
  "engagement_insights": "Was bei diesem Account besonders gut funktioniert...",
  "unique_elements": ["Element 1", "Element 2"]
}`;

    // Call Lovable AI with a powerful model for deep analysis
    console.log('Calling AI for style analysis...');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Using Pro for deep analysis
        messages: [
          { 
            role: 'system', 
            content: 'Du bist ein Experte für Social Media Content und Stilanalyse. Analysiere tiefgründig und liefere präzise, actionable Insights. Antworte immer auf Deutsch.' 
          },
          { role: 'user', content: analysisPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit erreicht. Bitte warte einen Moment.');
      }
      if (aiResponse.status === 402) {
        throw new Error('Credits aufgebraucht. Bitte lade Credits nach.');
      }
      throw new Error('KI-Analyse fehlgeschlagen');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Invalid AI response:', content);
      throw new Error('Ungültiges Antwortformat von der KI');
    }
    
    const analysis = JSON.parse(jsonMatch[0]);

    console.log('Style analysis completed successfully');

    // Log the analysis
    await supabase.from('logs').insert({
      user_id: user.id,
      event_type: 'style_analysis_completed',
      level: 'info',
      details: { 
        posts_analyzed: postsForAnalysis.length,
        top_engagement: topPerformers[0]?.engagement || 0
      },
    });

    return new Response(JSON.stringify({ 
      success: true,
      analysis,
      posts_analyzed: postsForAnalysis.length,
      top_performers_count: topPerformers.length
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