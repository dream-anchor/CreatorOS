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

    console.log(`Starting reply style analysis for user ${user.id}`);

    // Fetch replies (both sent via app and imported from IG)
    const { data: replies, error: repliesError } = await supabase
      .from('reply_queue')
      .select('reply_text')
      .eq('user_id', user.id)
      .or('status.eq.sent,status.eq.imported')
      .order('sent_at', { ascending: false })
      .limit(100);

    if (repliesError) throw repliesError;

    // Filter valid replies (length > 3, no empty ones)
    const validReplies = (replies || [])
      .map((r: any) => r.reply_text)
      .filter((t: string) => t && t.trim().length > 3)
      // Remove duplicates
      .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index);

    if (validReplies.length < 5) {
      return new Response(JSON.stringify({
        success: false,
        message: `Zu wenig Antworten (${validReplies.length}). Mindestens 5 benötigt.`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const analysisPool = validReplies.slice(0, 50); // Analyze max 50
    const repliesText = analysisPool.map((r: string, i: number) => `ANTWORT ${i+1}: "${r}"`).join('\n');

    const analysisPrompt = `Du bist ein Experte für Kommunikation und Ghostwriting. 
Hier sind ${analysisPool.length} echte Antworten, die ein Creator auf Instagram-Kommentare geschrieben hat.
Analysiere seine "Reply-DNA" präzise.

INPUT (Echte Antworten):
${repliesText}

---

ANALYSIERE FOLGENDE ASPEKTE:
1. **Tonalität**: Herzlich? Kurz angebunden? Witzig? Sachlich?
2. **Begrüßung/Abschied**: Nutzt er Hallo/Hi? Nutzt er LG/Grüße? Oder gar nichts?
3. **Emojis**: Viele? Wenige? Gar keine? Welche spezifisch?
4. **Struktur**: Einzeiler? Mehrere Sätze?
5. **Reaktion auf Lob**: Bedankt er sich überschwänglich oder cool?
6. **Du/Sie**: Duzt er immer?

ERSTELLE DARAUS:
1. **System-Instruktion (reply_style_system_prompt)**: Eine strikte Anweisung für eine KI, die genau so antworten soll. "Du antwortest wie... Nutze immer... Vermeide..."
2. **Beschreibung (reply_style_description)**: Kurze Zusammenfassung für den User.

Antworte NUR mit JSON:
{
  "reply_style_system_prompt": "Du antwortest immer...",
  "reply_style_description": "Du antwortest meist kurz und herzlich mit 1 Emoji..."
}`;

    // Call AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5', // High quality for analysis
        messages: [
          { role: 'system', content: 'Du bist ein JSON-Output Generator. Antworte nur mit validem JSON.' },
          { role: 'user', content: analysisPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
        const text = await aiResponse.text();
        console.error('AI Error:', text);
        throw new Error('AI request failed');
    }
    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid JSON from AI');
    const result = JSON.parse(jsonMatch[0]);

    // Save to DB
    const { error: updateError } = await supabase
      .from('brand_rules')
      .update({
        reply_style_system_prompt: result.reply_style_system_prompt,
        reply_style_description: result.reply_style_description,
        last_style_analysis_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      success: true,
      analyzed_count: analysisPool.length,
      result
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
