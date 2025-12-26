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

    // Get all unique ig_media_ids to fetch post captions
    const mediaIds = [...new Set(comments.map(c => c.ig_media_id).filter(Boolean))];
    
    // Fetch all related posts
    const { data: posts } = await supabase
      .from('posts')
      .select('ig_media_id, caption')
      .in('ig_media_id', mediaIds);

    const postCaptionMap = new Map<string, string>();
    posts?.forEach(p => {
      if (p.ig_media_id && p.caption) {
        postCaptionMap.set(p.ig_media_id, p.caption);
      }
    });

    // Get brand rules for tone
    const { data: brandRules } = await supabase
      .from('brand_rules')
      .select('tone_style, writing_style, language_primary')
      .eq('user_id', user.id)
      .maybeSingle();

    const toneStyle = brandRules?.tone_style || 'locker und authentisch';
    const language = brandRules?.language_primary || 'DE';

    // Batch analyze comments with AI - include post context
    const commentsToAnalyze = comments.map(c => {
      const postCaption = postCaptionMap.get(c.ig_media_id) || '';
      return {
        id: c.id,
        text: c.comment_text,
        username: c.commenter_username,
        post_context: postCaption.substring(0, 300) // Truncate for token efficiency
      };
    });

    // Build emoji constraint section for prompt
    let emojiConstraint = '';
    if (emojiNogoList.length > 0) {
      emojiConstraint = `
EMOJI-EINSCHRÄNKUNG:
Vermeide Emojis zu diesen Themen: ${emojiNogoList.join(', ')}.
Nutze stattdessen neutrale: 🙌 👍 😎 🔥 ✨ 💪 🎯 👏 ⚡ 🚀 💯`;
    }

    const analysisPrompt = `Du bist Antoine, ein Instagram-Creator. Du analysierst Kommentare und schreibst persönliche Antworten.

SPRACHE: ${language === 'DE' ? 'Deutsch' : language}
TONALITÄT: ${toneStyle}

===== ABSOLUTE VERBOTE FÜR ANTWORTEN (NIEMALS BRECHEN!) =====
❌ KEINE Hashtags (#) - Niemals, unter keinen Umständen
❌ KEINE Signaturen ("Dein Team", "@support", "Liebe Grüße")
❌ KEINE CTAs ("Link in Bio", "Schau mal hier")
❌ KEINE Marketing-Sprache ("Wir freuen uns", "Vielen Dank für Ihr Feedback")
❌ KEINE Support-Ticket-Floskeln ("Bei Fragen stehen wir zur Verfügung")
==============================================================

DU BIST EIN MENSCH, KEINE MARKE. Kurze, direkte, authentische Antworten.
${emojiConstraint}

Analysiere jeden Kommentar:
1. sentiment_score: -1.0 (Hass) bis 1.0 (sehr positiv)
2. is_critical: true bei Hass, Beleidigung, Spam, heftiger Kritik
3. reply_suggestion: Kurze Antwort (1-2 Sätze), die auf den KONTEXT DES POSTS eingeht

WICHTIG: Jeder Kommentar hat ein "post_context" Feld mit der Caption meines Posts.
Beziehe dich in der Antwort auf den Kontext - verstehe Witze und Anspielungen!

Kommentare als JSON:
${JSON.stringify(commentsToAnalyze)}

Antworte NUR mit JSON-Array:
[{"id": "uuid", "sentiment_score": 0.8, "is_critical": false, "reply_suggestion": "Haha ja genau! 😎"}]`;

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
