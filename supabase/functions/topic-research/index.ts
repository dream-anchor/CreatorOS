import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, context } = await req.json();

    if (!topic) {
      throw new Error('Topic is required');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Researching topic:', topic);

    const systemPrompt = `Du bist ein erfahrener Social Media Redakteur und Content-Stratege für einen deutschen Schauspieler.
Deine Aufgabe: Entwickle kreative, unkonventionelle Post-Ideen zu einem gegebenen Thema.

DEIN ANSATZ:
- Denke wie ein Storyteller, nicht wie ein Marketing-Bot
- Suche nach überraschenden Blickwinkeln und unerwarteten Perspektiven
- Vermeide abgedroschene Phrasen und Standard-Content
- Berücksichtige aktuelle Trends und Zeitgeist
- Der Content soll authentisch und persönlich wirken

WICHTIG:
- Jede Idee braucht eine provokante, neugierig machende Hook (erster Satz)
- Die Hook soll zum Stoppen beim Scrollen animieren
- Denke an die Zielgruppe: Menschen, die authentischen Behind-the-Scenes Content mögen

Antworte IMMER im folgenden JSON-Format:
{
  "ideas": [
    {
      "angle": "Der unkonventionelle Blickwinkel/Ansatz",
      "hook": "Der provokante erste Satz des Posts",
      "outline": "Kurze Beschreibung des Post-Inhalts (2-3 Sätze)",
      "hashtag_suggestions": ["hashtag1", "hashtag2", "hashtag3"],
      "best_time": "Empfohlene Uhrzeit/Tag für diesen Post",
      "format_suggestion": "Empfohlenes Format: Foto, Carousel, Reel, Story"
    }
  ],
  "trend_insights": "Aktuelle Trends oder Beobachtungen zu diesem Thema (optional)",
  "warning": "Mögliche Stolperfallen oder Dinge, die man vermeiden sollte (optional)"
}`;

    const userPrompt = `Thema: "${topic}"

${context ? `Zusätzlicher Kontext: ${context}` : ''}

Entwickle 5 spannende, unkonventionelle Post-Ideen für einen Schauspieler zu diesem Thema.
Jede Idee soll einen anderen Blickwinkel haben und authentisch wirken.
Denke an Hooks, die zum Stoppen animieren.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit erreicht. Bitte versuche es in einer Minute erneut.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Keine Credits mehr. Bitte lade dein Konto auf.' 
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI request failed: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing...');

    // Parse the JSON from the response
    let research;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        research = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.log('Raw content:', content);
      throw new Error('Failed to parse AI response');
    }

    console.log('Research completed:', research.ideas?.length, 'ideas generated');

    return new Response(JSON.stringify({
      success: true,
      research,
      topic,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Topic research error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
