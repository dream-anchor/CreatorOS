import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to detect if fan uses formal "Sie" language
function detectFormalLanguage(text: string): boolean {
  const formalPatterns = [
    /\bSie\b/,           // "Sie" as pronoun
    /\bIhnen\b/,         // "Ihnen"
    /\bIhr\b/,           // "Ihr" (formal)
    /\bIhre\b/,          // "Ihre"
    /\bHerr\s+\w+/i,     // "Herr [Name]"
    /\bFrau\s+\w+/i,     // "Frau [Name]"
    /\bkönnten Sie\b/i,  // "könnten Sie"
    /\bwürden Sie\b/i,   // "würden Sie"
  ];
  return formalPatterns.some(pattern => pattern.test(text));
}

// Helper to validate if an image URL is accessible
async function isImageUrlValid(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  try {
    // Quick HEAD request to check if URL is accessible
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type') || '';
    return response.ok && (contentType.startsWith('image/') || contentType.startsWith('video/'));
  } catch {
    return false;
  }
}

// Build multimodal message content with image if available
function buildMultimodalContent(textContent: string, imageUrl: string | null): any[] {
  const content: any[] = [{ type: "text", text: textContent }];
  
  if (imageUrl) {
    content.push({
      type: "image_url",
      image_url: { url: imageUrl }
    });
  }
  
  return content;
}

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

    // Get all unique ig_media_ids to fetch post data INCLUDING image URLs
    const mediaIds = [...new Set(comments.map(c => c.ig_media_id).filter(Boolean))];
    
    // Fetch all related posts for context - now including original_media_url and format
    const { data: posts } = await supabase
      .from('posts')
      .select('ig_media_id, caption, original_media_url, format')
      .in('ig_media_id', mediaIds);

    const postDataMap = new Map<string, { caption: string; imageUrl: string | null; format: string | null }>();
    posts?.forEach(p => {
      if (p.ig_media_id) {
        postDataMap.set(p.ig_media_id, {
          caption: p.caption || '',
          imageUrl: p.original_media_url || null,
          format: p.format || null
        });
      }
    });

    // Get brand rules for tone AND formality mode
    const { data: brandRules } = await supabase
      .from('brand_rules')
      .select('tone_style, writing_style, language_primary, formality_mode, reply_style_system_prompt')
      .eq('user_id', user.id)
      .maybeSingle();

    const toneStyle = brandRules?.tone_style || 'locker und authentisch';
    const language = brandRules?.language_primary || 'DE';
    const formalityMode = brandRules?.formality_mode || 'smart';
    const replyStylePrompt = brandRules?.reply_style_system_prompt || '';

    // ========== DYNAMIC STYLE LEARNING ==========
    // Query last 15-20 approved/sent replies as few-shot examples
    const { data: pastReplies } = await supabase
      .from('reply_queue')
      .select('reply_text')
      .eq('user_id', user.id)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(20);

    // Filter out emoji-only replies and build examples
    const validExamples = (pastReplies || [])
      .map(r => r.reply_text)
      .filter(text => {
        const withoutEmojis = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
        return withoutEmojis.length >= 3;
      })
      .slice(0, 15);

    const fewShotSection = validExamples.length > 0
      ? `
LERNE VON DIESEN ECHTEN ANTWORTEN DES USERS (kopiere den Vibe und die Satzlänge):
${validExamples.map((ex, i) => `${i + 1}. "${ex}"`).join('\n')}`
      : '';

    // Validate image URLs and prepare comments for analysis
    const commentsToAnalyze: any[] = [];
    let hasAnyValidImage = false;

    for (const c of comments) {
      const postData = postDataMap.get(c.ig_media_id);
      const postCaption = postData?.caption || '';
      let imageUrl = postData?.imageUrl || null;
      
      // Validate image URL
      if (imageUrl) {
        const isValid = await isImageUrlValid(imageUrl);
        if (!isValid) {
          console.log(`[analyze-comments] Image URL invalid/expired for media ${c.ig_media_id}, falling back to text-only`);
          imageUrl = null;
        } else {
          hasAnyValidImage = true;
        }
      }
      
      const fanUsesFormal = detectFormalLanguage(c.comment_text);
      
      let formalityHint = '';
      if (formalityMode === 'smart') {
        formalityHint = fanUsesFormal ? 'use_sie' : 'use_du';
      } else if (formalityMode === 'sie') {
        formalityHint = 'use_sie';
      } else {
        formalityHint = 'use_du';
      }

      commentsToAnalyze.push({
        id: c.id,
        text: c.comment_text,
        username: c.commenter_username,
        post_context: postCaption.substring(0, 300),
        image_url: imageUrl,
        formality: formalityHint
      });
    }

    // Build emoji constraint section for prompt
    let emojiConstraint = '';
    if (emojiNogoList.length > 0) {
      emojiConstraint = `
EMOJI-EINSCHRÄNKUNG:
Vermeide Emojis zu diesen Themen: ${emojiNogoList.join(', ')}.
Nutze stattdessen neutrale: 🙌 👍 😎 🔥 ✨ 💪 🎯 👏 ⚡ 🚀 💯`;
    }

    // Vision-enhanced prompt
    const visionSection = hasAnyValidImage ? `
===== VISUELLER KONTEXT (WICHTIG!) =====
Einige Kommentare haben ein beigefügtes Bild des Posts.
ANALYSIERE das Bild: Was ist darauf zu sehen? (Landschaft, Person, Essen, Tier, Selfie, etc.)
NUTZE diese Info für kontextbezogene Antworten!
Beispiel: Wenn jemand "Wow!" schreibt und auf dem Bild ist ein Hund → Antworte: "Ja, er ist echt süß, oder? 🐕"
Falls kein Bild vorhanden ist, basiere die Antwort nur auf dem Text.
========================================` : '';

    const analysisPrompt = `ROLLE: Du BIST der User (Antoine). Du bist KEIN Assistent. Du analysierst Kommentare und schreibst persönliche Antworten.

SPRACHE: ${language === 'DE' ? 'Deutsch' : language}
TONALITÄT: ${toneStyle}

${replyStylePrompt ? `===== DEIN GELERNTES ANTWORT-PROFIL (WICHTIG!) =====\n${replyStylePrompt}\n================================================` : ''}

${fewShotSection}

===== PERSONA-REGELN FÜR ANTWORTEN (NIEMALS BRECHEN!) =====
✅ IMMER in der 1. Person Singular ("Ich")
❌ NIEMALS "Wir", "Uns", "Das Team", "Unser"
❌ KEINE Signaturen ("Dein Antoine", "LG", "Grüße")
❌ KEINE Hashtags (#)
❌ KEINE CTAs ("Link in Bio", "Schau mal hier")
❌ KEINE Marketing-Sprache ("Wir freuen uns")
============================================================
${visionSection}

ANSPRACHE:
- Wenn "formality": "use_sie" → Antworte mit "Sie" (formell)
- Wenn "formality": "use_du" → Antworte mit "Du" (informell)
${emojiConstraint}

Analysiere jeden Kommentar:
1. sentiment_score: -1.0 (Hass) bis 1.0 (sehr positiv)
2. is_critical: true bei Hass, Beleidigung, Spam, heftiger Kritik
3. reply_suggestion: Kurze Antwort (1-2 Sätze), die auf den POST-KONTEXT und ggf. das BILD eingeht

WICHTIG: Jeder Kommentar hat:
- "post_context": Caption meines Posts → Beziehe dich darauf, verstehe Witze!
- "image_url": URL des Post-Bildes (falls vorhanden) → Beschreibe was du siehst und beziehe dich darauf!
- "formality": Ob du siezen oder duzen sollst

Kommentare als JSON:
${JSON.stringify(commentsToAnalyze.map(c => ({ ...c, image_url: c.image_url ? "[BILD VORHANDEN - ANALYSIERE ES]" : null })))}

Antworte NUR mit JSON-Array:
[{"id": "uuid", "sentiment_score": 0.8, "is_critical": false, "reply_suggestion": "Haha ja genau! 😎"}]`;

    // Build multimodal messages if we have images
    let messages: any[];
    
    if (hasAnyValidImage) {
      // Use multimodal content with images
      const contentParts: any[] = [{ type: "text", text: analysisPrompt }];
      
      // Add valid images as separate image parts
      for (const c of commentsToAnalyze) {
        if (c.image_url) {
          contentParts.push({
            type: "text",
            text: `[Bild für Kommentar-ID ${c.id}]:`
          });
          contentParts.push({
            type: "image_url",
            image_url: { url: c.image_url }
          });
        }
      }
      
      messages = [{ role: 'user', content: contentParts }];
    } else {
      // Text-only fallback
      messages = [{ role: 'user', content: analysisPrompt }];
    }

    console.log(`[analyze-comments] Sending request with ${hasAnyValidImage ? 'vision (multimodal)' : 'text-only'} mode`);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
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

    console.log(`[analyze-comments] Updated ${updatedCount} comments (vision: ${hasAnyValidImage})`);

    return new Response(JSON.stringify({
      success: true,
      analyzed: updatedCount,
      critical: analysisResults.filter(r => r.is_critical).length,
      vision_enabled: hasAnyValidImage
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
