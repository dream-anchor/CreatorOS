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

    // Get the comment
    const { data: comment, error: commentError } = await supabase
      .from('instagram_comments')
      .select('*')
      .eq('id', comment_id)
      .eq('user_id', user.id)
      .single();

    if (commentError || !comment) {
      throw new Error('Comment not found');
    }

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
WICHTIGE EMOJI-EINSCHRÄNKUNG - STRIKT BEFOLGEN:
Du darfst unter KEINEN Umständen Emojis verwenden, die mit folgenden Begriffen assoziiert sind: ${emojiNogoList.join(', ')}.

Emoji-Zuordnungen die du vermeiden MUSST:
- "Liebe" / "Herzen" → KEINE: ❤️ 💕 💖 💗 💝 😍 🥰 😘 💋 😻 💘 💓 💞 💟 ♥️
- "Trauer" / "Weinen" → KEINE: 😢 😭 😿 💔 🥺 😥 😪
- "Kitsch" / "Süß" → KEINE: 🥹 🤗 😊 🥰 💖 ✨ 🌸 🦋 🌈
- "Wut" / "Aggression" → KEINE: 😡 🤬 💢 👊 🔥 (als Wut)

Nutze stattdessen NEUTRALE Alternativen: 🙌 👍 😎 🔥 ✨ 💪 🎯 👏 ⚡ 🚀 💯 🙏`;
    }

    const replyPrompt = `Du bist ein Instagram-Creator der schnell und authentisch antwortet.

Generiere eine kurze, freundliche Antwort (maximal 2-3 Sätze) auf diesen Kommentar:

Kommentar von @${comment.commenter_username || 'Fan'}:
"${comment.comment_text}"
${emojiConstraint}

Sei direkt, reaktiv und locker wie ein Creator der mal eben vom Set schreibt. Maximal 2-3 Sätze.

Antworte NUR mit dem Antwort-Text, keine Erklärungen.`;

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
