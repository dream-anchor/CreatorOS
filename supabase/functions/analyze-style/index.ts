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

    console.log(`Starting style analysis for user ${user.id} - reading from database only`);

    // Get Instagram username from meta_connections for context
    const { data: connection } = await supabase
      .from('meta_connections')
      .select('ig_username')
      .eq('user_id', user.id)
      .single();

    const igUsername = connection?.ig_username || 'User';

    // WICHTIG: Lese NUR aus der Datenbank-Tabelle posts (imported posts)
    // Keine Instagram API Aufrufe mehr!
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('caption, published_at, likes_count, comments_count')
      .eq('user_id', user.id)
      .eq('is_imported', true)
      .not('caption', 'is', null)
      .order('published_at', { ascending: false })
      .limit(50);

    if (postsError) {
      console.error('Database error:', postsError);
      throw new Error('Fehler beim Lesen der Posts aus der Datenbank');
    }

    console.log(`Found ${posts?.length || 0} imported posts in database`);

    if (!posts || posts.length === 0) {
      throw new Error('Keine importierten Posts gefunden. Bitte importiere zuerst Posts in der Post-Historie.');
    }

    // Filter posts with valid captions
    const postsWithCaptions = posts.filter((post: any) => post.caption && post.caption.trim().length > 10);
    
    if (postsWithCaptions.length < 3) {
      throw new Error(`Nur ${postsWithCaptions.length} Posts mit Captions gefunden. Mindestens 3 werden benötigt.`);
    }

    // Take top 20 for analysis
    const analysisPool = postsWithCaptions.slice(0, 20);

    // Prepare captions for analysis
    const captionsText = analysisPool
      .map((post: any, index: number) => `POST ${index + 1}:\n"${post.caption}"`)
      .join('\n\n---\n\n');

    console.log(`Analyzing ${analysisPool.length} posts with Ghostwriter prompt (from DB, not Instagram API)`);

    // The specific Ghostwriter analysis prompt
    const analysisPrompt = `Du bist ein erfahrener Ghostwriter. Hier sind ${analysisPool.length} Original-Posts von @${igUsername}. Analysiere seine DNA:

${captionsText}

---

ANALYSIERE FOLGENDE ASPEKTE DIESER POSTS:

1. **Hook-Analyse**: Wie steigt er in Texte ein? Welche Arten von Eröffnungssätzen nutzt er? (z.B. Fragen, Statements, Szenen)

2. **Emoji-Nutzung**: Welche Emojis nutzt er regelmäßig? Welche nutzt er NIE? Wie häufig insgesamt? Wo platziert er sie?

3. **Satzlänge**: Kurze oder lange Sätze? Variiert er? Nutzt er Fragmente?

4. **Tonalität**: Ist er ironisch, ernst, kumpelhaft, nachdenklich, witzig, sarkastisch? Wie zeigt sich das konkret?

5. **Ansprache**: Duzt oder siezt er? Nutzt er "man" oder "du"? Spricht er die Community direkt an?

6. **Struktur**: Wie baut er Posts auf? Absätze? Listen? Einzeiler?

7. **Besonderheiten**: Catchphrases? Wiederkehrende Formulierungen? Signature-Elemente?

---

ERSTELLE DARAUS ZWEI DINGE:

**A) SYSTEM-INSTRUKTION (style_system_prompt)**
Erstelle eine präzise System-Instruktion für einen KI-Bot, der neue Posts in EXAKT diesem Stil schreiben soll. Die Instruktion muss so konkret sein, dass die KI den Stil perfekt imitieren kann.

**B) ANALYSE-ZUSAMMENFASSUNG (analysis)**
Fasse die wichtigsten Erkenntnisse zusammen.

---

Antworte NUR mit validem JSON in diesem Format:
{
  "style_system_prompt": "Du bist ein Instagram-Content-Creator und schreibst im Stil von @${igUsername}. Dein Stil zeichnet sich aus durch: [KONKRETE ANWEISUNGEN]...",
  "style_description": "Kurze Beschreibung des Stils (2-3 Sätze)",
  "writing_style": "Schlagworte zum Stil (z.B. 'Selbstironisch, kurze Sätze, viele Emojis')",
  "hook_patterns": ["Hook-Muster 1", "Hook-Muster 2"],
  "emoji_usage": {
    "favorites": ["🔥", "😂"],
    "avoided": ["💯", "🙏"],
    "frequency": "moderat"
  },
  "sentence_style": "Beschreibung der Satzstruktur",
  "tone": "Beschreibung der Tonalität",
  "address_style": "Du/Sie/man + Beschreibung",
  "do_list": ["Was er immer tut 1", "Was er immer tut 2"],
  "dont_list": ["Was er nie tut 1", "Was er nie tut 2"],
  "example_posts": "Die 2-3 besten Beispiel-Posts, die den Stil perfekt zeigen (mit --- getrennt)",
  "emoji_level": 2,
  "unique_elements": ["Besonderheit 1", "Besonderheit 2"]
}`;

    // Call Lovable AI with GPT-5 for best quality
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        messages: [
          { 
            role: 'system', 
            content: 'Du bist ein Experte für Stilanalyse und Ghostwriting. Du analysierst Schreibstile präzise und erstellst actionable Instruktionen. Antworte immer auf Deutsch und immer mit validem JSON.' 
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

    console.log('Style analysis completed, saving to database...');

    // Auto-save results to brand_rules
    const { error: updateError } = await supabase
      .from('brand_rules')
      .update({
        tone_style: analysis.style_description,
        writing_style: analysis.writing_style,
        style_system_prompt: analysis.style_system_prompt,
        do_list: analysis.do_list,
        dont_list: analysis.dont_list,
        example_posts: analysis.example_posts,
        emoji_level: analysis.emoji_level,
        last_style_analysis_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error saving analysis:', updateError);
      throw new Error('Analyse konnte nicht gespeichert werden');
    }

    console.log('Analysis saved successfully');

    // Log the analysis
    await supabase.from('logs').insert({
      user_id: user.id,
      event_type: 'style_analysis_completed',
      level: 'info',
      details: { 
        posts_analyzed: analysisPool.length,
        total_posts_in_db: posts.length,
        model: 'openai/gpt-5',
        auto_saved: true,
        source: 'database' // Wichtig: Kennzeichnung dass Daten aus DB kommen
      },
    });

    return new Response(JSON.stringify({ 
      success: true,
      analysis,
      posts_analyzed: analysisPool.length,
      total_posts_available: posts.length,
      saved: true,
      analyzed_at: new Date().toISOString(),
      source: 'database'
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
