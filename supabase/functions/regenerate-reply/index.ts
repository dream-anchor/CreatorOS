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

    const { comment_id, model } = await req.json();

    if (!comment_id) {
      throw new Error('comment_id required');
    }

    // Use provided model or default to gemini flash
    const aiModel = model || 'google/gemini-2.5-flash';

    console.log(`[regenerate-reply] Regenerating reply for comment ${comment_id} using model ${aiModel}`);

    // Get the comment WITH post context
    const { data: comment, error: commentError } = await supabase
      .from('instagram_comments')
      .select('*, ig_media_id')
      .eq('id', comment_id)
      .eq('user_id', user.id)
      .single();

    if (commentError || !comment) {
      throw new Error('Comment not found');
    }

    // Get the post caption for context
    let postCaption = '';
    if (comment.ig_media_id) {
      const { data: post } = await supabase
        .from('posts')
        .select('caption')
        .eq('ig_media_id', comment.ig_media_id)
        .maybeSingle();
      
      postCaption = post?.caption || '';
    }

    // Get brand rules for tone
    const { data: brandRules } = await supabase
      .from('brand_rules')
      .select('tone_style, writing_style, language_primary, do_list, dont_list')
      .eq('user_id', user.id)
      .maybeSingle();

    const toneStyle = brandRules?.tone_style || 'locker und authentisch';
    const writingStyle = brandRules?.writing_style || '';
    const language = brandRules?.language_primary || 'DE';

    // Get emoji no-go terms
    const { data: emojiNogoTerms } = await supabase
      .from('emoji_nogo_terms')
      .select('term')
      .eq('user_id', user.id);

    const emojiNogoList = emojiNogoTerms?.map(t => t.term) || [];

    // Build emoji constraint
    let emojiConstraint = '';
    if (emojiNogoList.length > 0) {
      emojiConstraint = `
EMOJI-EINSCHRÄNKUNG:
Vermeide Emojis zu diesen Themen: ${emojiNogoList.join(', ')}.
Nutze stattdessen neutrale: 🙌 👍 😎 🔥 ✨ 💪 🎯 👏 ⚡ 🚀 💯`;
    }

    // Build context section
    const contextSection = postCaption 
      ? `
---
KONTEXT - MEIN ORIGINAL-POST:
"${postCaption.substring(0, 500)}${postCaption.length > 500 ? '...' : ''}"
---`
      : '';

    const replyPrompt = `Du bist Antoine, ein Instagram-Creator. Du antwortest persönlich auf Fan-Kommentare.

SPRACHE: ${language === 'DE' ? 'Deutsch' : language}
TONALITÄT: ${toneStyle}
${writingStyle ? `STIL: ${writingStyle}` : ''}

===== ABSOLUTE VERBOTE (NIEMALS BRECHEN!) =====
❌ KEINE Hashtags (#) - Niemals, unter keinen Umständen
❌ KEINE Signaturen ("Dein Team", "@support", "Liebe Grüße, das Team")
❌ KEINE CTAs ("Link in Bio", "Schau mal hier", "Mehr Infos")
❌ KEINE Marketing-Sprache ("Wir freuen uns", "Vielen Dank für Ihr Feedback")
❌ KEINE Support-Ticket-Floskeln ("Gerne geschehen", "Bei Fragen stehen wir zur Verfügung")
===================================================

DU BIST EIN MENSCH, KEINE MARKE.
Schreibe wie jemand, der kurz vom Handy antwortet - direkt, knackig, authentisch.
${emojiConstraint}
${contextSection}

KOMMENTAR VON @${comment.commenter_username || 'Fan'}:
"${comment.comment_text}"

Antworte KURZ (1-2 Sätze max), DIREKT auf den Kommentar, im Kontext meines Posts.
Verstehe Witze und Anspielungen und reagiere darauf.

NUR die Antwort, nichts anderes:`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'user', content: replyPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('AI generation failed');
    }

    const aiData = await aiResponse.json();
    const newReply = aiData.choices?.[0]?.message?.content?.trim() || '';

    if (!newReply) {
      throw new Error('Empty reply generated');
    }

    console.log(`[regenerate-reply] New reply: ${newReply.substring(0, 50)}...`);

    // Update the comment with new reply
    const { error: updateError } = await supabase
      .from('instagram_comments')
      .update({ ai_reply_suggestion: newReply })
      .eq('id', comment_id);

    if (updateError) {
      throw new Error('Failed to update comment');
    }

    return new Response(JSON.stringify({
      success: true,
      comment_id,
      new_reply: newReply
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[regenerate-reply] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
