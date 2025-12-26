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

    console.log(`[analyze-comments] Starting sentiment analysis for user ${user.id}`);

    // Get blacklist topics
    const { data: blacklistTopics } = await supabase
      .from('blacklist_topics')
      .select('topic')
      .eq('user_id', user.id);

    const blacklist = blacklistTopics?.map(t => t.topic.toLowerCase()) || [];

    // Get emoji no-go terms
    const { data: emojiNogoTerms } = await supabase
      .from('emoji_nogo_terms')
      .select('term')
      .eq('user_id', user.id);

    const emojiNogoList = emojiNogoTerms?.map(t => t.term) || [];

    // Fetch unreplied comments without AI analysis yet
    const { data: comments, error: commentsError } = await supabase
      .from('instagram_comments')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_replied', false)
      .eq('is_hidden', false)
      .is('sentiment_score', null)
      .limit(50);

    if (commentsError) {
      throw new Error('Failed to fetch comments');
    }

    console.log(`[analyze-comments] Analyzing ${comments?.length || 0} comments`);

    if (!comments || comments.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        analyzed: 0,
        message: 'Keine neuen Kommentare zur Analyse'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Batch analyze comments with AI
    const commentsToAnalyze = comments.map(c => ({
      id: c.id,
      text: c.comment_text,
      username: c.commenter_username
    }));

    // Build emoji constraint section for prompt
    let emojiConstraint = '';
    if (emojiNogoList.length > 0) {
      emojiConstraint = `

WICHTIGE EMOJI-EINSCHRÄNKUNG:
Du darfst unter KEINEN Umständen Emojis verwenden, die mit folgenden Begriffen assoziiert sind: ${emojiNogoList.join(', ')}.
Beispiel: Wenn "Liebe" in der Liste steht, nutze KEINE Herz-Emojis (❤️, 😍, 😘, 💕, 💖, 💗, 💝, 🥰, 😻) oder andere romantische/liebevolle Emojis.
Nutze stattdessen neutrale, coole Gesten wie 🙌, 👍, 😎, 🔥, ✨, 💪, 🎯, 👏 oder ⚡.
Halte dich STRIKT an diese Vorgabe!`;
    }

    const analysisPrompt = `Du bist ein Sentiment-Analysator für Instagram-Kommentare.

Analysiere jeden Kommentar und gib für jeden zurück:
1. sentiment_score: Eine Zahl von -1.0 (sehr negativ/Hass) bis 1.0 (sehr positiv)
2. is_critical: true wenn der Kommentar Hass, Beleidigung, Spam oder heftige Kritik enthält
3. reply_suggestion: Ein freundlicher, kurzer Antwort-Vorschlag (maximal 2-3 Sätze, darf Emojis nutzen, sei direkt und reaktiv wie ein Creator der mal eben vom Set schreibt)

WICHTIGE EINSCHRÄNKUNG - ABSOLUTES HASHTAG-VERBOT:
Du darfst unter KEINEN Umständen Hashtags (#) verwenden. Keine #hashtags, niemals. Schreibe wie ein Mensch in einem Chat, nicht wie ein Marketer.
${emojiConstraint}

Hier sind die Kommentare als JSON:
\${JSON.stringify(commentsToAnalyze)}

Antworte NUR mit einem JSON-Array in diesem Format:
[
  {
    "id": "uuid",
    "sentiment_score": 0.8,
    "is_critical": false,
    "reply_suggestion": "Danke dir! 🙏 Freut mich mega!"
  }
]`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: analysisPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';

    // Parse AI response
    let analysisResults: any[] = [];
    try {
      // Extract JSON from response
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        analysisResults = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
    }

    console.log(`[analyze-comments] Got ${analysisResults.length} analysis results`);

    // Update comments with analysis
    let updatedCount = 0;
    for (const result of analysisResults) {
      const comment = comments.find(c => c.id === result.id);
      if (!comment) continue;

      // Check blacklist - if comment text contains blacklisted topic, hide it
      const shouldHide = blacklist.some(topic => 
        comment.comment_text.toLowerCase().includes(topic)
      );

      const { error: updateError } = await supabase
        .from('instagram_comments')
        .update({
          sentiment_score: result.sentiment_score,
          is_critical: result.is_critical || result.sentiment_score < -0.3,
          ai_reply_suggestion: result.reply_suggestion,
          is_hidden: shouldHide,
        })
        .eq('id', result.id);

      if (!updateError) {
        updatedCount++;
      }
    }

    console.log(`[analyze-comments] Updated ${updatedCount} comments`);

    return new Response(JSON.stringify({
      success: true,
      analyzed: updatedCount,
      critical: analysisResults.filter(r => r.is_critical).length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[analyze-comments] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
