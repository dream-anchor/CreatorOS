import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODELS = [
  { id: "google/gemini-2.5-flash", name: "Gemini Flash" },
  { id: "google/gemini-2.5-pro", name: "Gemini Pro" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
  { id: "openai/gpt-5", name: "GPT-5" },
];

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get 3 random unanswered comments WITH their post context
    const { data: comments, error: commentsError } = await supabase
      .from("instagram_comments")
      .select("id, comment_text, commenter_username, ig_media_id")
      .eq("user_id", user.id)
      .eq("is_replied", false)
      .eq("is_hidden", false)
      .limit(10);

    if (commentsError) {
      console.error("Error fetching comments:", commentsError);
      return new Response(JSON.stringify({ error: "Failed to fetch comments" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!comments || comments.length === 0) {
      return new Response(JSON.stringify({ error: "No comments found", comments: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all unique ig_media_ids to fetch post captions
    const mediaIds = [...new Set(comments.map(c => c.ig_media_id).filter(Boolean))];
    
    // Fetch all related posts for context
    const { data: posts } = await supabase
      .from("posts")
      .select("ig_media_id, caption")
      .in("ig_media_id", mediaIds);

    const postCaptionMap = new Map<string, string>();
    posts?.forEach(p => {
      if (p.ig_media_id && p.caption) {
        postCaptionMap.set(p.ig_media_id, p.caption);
      }
    });

    // Shuffle and pick 3 random comments
    const shuffled = comments.sort(() => Math.random() - 0.5);
    const selectedComments = shuffled.slice(0, 3);

    // Get brand rules for context
    const { data: brandRules } = await supabase
      .from("brand_rules")
      .select("tone_style, writing_style, language_primary, do_list, dont_list, formality_mode")
      .eq("user_id", user.id)
      .maybeSingle();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== DYNAMIC STYLE LEARNING ==========
    // Use service role to fetch past replies
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: pastReplies } = await supabaseService
      .from("reply_queue")
      .select("reply_text")
      .eq("user_id", user.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(20);

    // Filter out emoji-only replies
    const validExamples = (pastReplies || [])
      .map(r => r.reply_text)
      .filter(text => {
        const withoutEmojis = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').trim();
        return withoutEmojis.length >= 3;
      })
      .slice(0, 15);

    const fewShotSection = validExamples.length > 0
      ? `
========== LERNE VON MEINEN ECHTEN ANTWORTEN ==========
Kopiere den Vibe, die Satzlänge und Formatierung dieser echten Beispiele:

${validExamples.map((ex, i) => `${i + 1}. "${ex}"`).join('\n')}
======================================================`
      : '';

    // Build system prompt with strict constraints
    const toneStyle = brandRules?.tone_style || "locker und authentisch";
    const writingStyle = brandRules?.writing_style || "";
    const language = brandRules?.language_primary || "DE";
    const formalityMode = brandRules?.formality_mode || "smart";

    const systemPrompt = `ROLLE: Du BIST der User (Antoine). Du bist KEIN Assistent. Du antwortest persönlich auf Fan-Kommentare.

SPRACHE: ${language === "DE" ? "Deutsch" : language}
TONALITÄT: ${toneStyle}
${writingStyle ? `STIL: ${writingStyle}` : ""}
${fewShotSection}

===== PERSONA-REGELN (NIEMALS BRECHEN!) =====
✅ IMMER in der 1. Person Singular ("Ich")
❌ NIEMALS "Wir", "Uns", "Das Team", "Unser"
❌ KEINE Signaturen ("Dein Antoine", "LG", "Grüße")
❌ KEINE Hashtags (#)
❌ KEINE CTAs ("Link in Bio", "Schau mal hier")
❌ KEINE Marketing-Sprache ("Wir freuen uns")
❌ KEINE Support-Floskeln ("Bei Fragen stehen wir zur Verfügung")
==============================================

Schreibe wie jemand, der kurz vom Handy antwortet - direkt, knackig, authentisch.
Verstehe Witze und Anspielungen und reagiere darauf.
Kurze Antworten (1-2 Sätze), passende Emojis sparsam nutzen.`;

    // Generate responses for each comment from each model
    const results: Array<{
      commentId: string;
      commentText: string;
      commenterUsername: string;
      responses: Record<string, string>;
    }> = [];

    for (const comment of selectedComments) {
      const responses: Record<string, string> = {};
      
      // Get post context for this comment
      const postCaption = postCaptionMap.get(comment.ig_media_id) || '';
      const contextSection = postCaption 
        ? `\n\nKONTEXT - MEIN ORIGINAL-POST:\n"${postCaption.substring(0, 300)}${postCaption.length > 300 ? '...' : ''}"`
        : '';

      // Determine formality for this comment
      const fanUsesFormal = detectFormalLanguage(comment.comment_text);
      let formalityInstruction = '';
      if (formalityMode === 'smart') {
        formalityInstruction = fanUsesFormal 
          ? '\nANSPRACHE: Der Fan siezt → Antworte mit "Sie".'
          : '\nANSPRACHE: Der Fan duzt → Antworte mit "Du".';
      } else if (formalityMode === 'sie') {
        formalityInstruction = '\nANSPRACHE: Antworte mit "Sie" (formell).';
      } else {
        formalityInstruction = '\nANSPRACHE: Antworte mit "Du" (informell).';
      }

      // Generate from all models in parallel
      const modelPromises = MODELS.map(async (model) => {
        try {
          console.log(`Generating response for comment ${comment.id} with model ${model.id}`);
          
          const userMessage = `${contextSection}
${formalityInstruction}

KOMMENTAR VON @${comment.commenter_username || "Fan"}:
"${comment.comment_text}"

Antworte KURZ (1-2 Sätze), DIREKT auf den Kommentar, im Kontext meines Posts.`;

          const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model.id,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
              ],
            }),
          });

          if (!response.ok) {
            console.error(`Model ${model.id} error:`, response.status);
            return { modelId: model.id, reply: "⚠️ Fehler bei der Generierung" };
          }

          const data = await response.json();
          const reply = data.choices?.[0]?.message?.content || "Keine Antwort generiert";
          
          return { modelId: model.id, reply };
        } catch (err) {
          console.error(`Error with model ${model.id}:`, err);
          return { modelId: model.id, reply: "⚠️ Fehler" };
        }
      });

      const modelResults = await Promise.all(modelPromises);
      
      for (const result of modelResults) {
        responses[result.modelId] = result.reply;
      }

      results.push({
        commentId: comment.id,
        commentText: comment.comment_text,
        commenterUsername: comment.commenter_username || "Fan",
        responses,
      });
    }

    console.log(`Successfully generated ${results.length} comparison sets`);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error in simulate-model-responses:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});