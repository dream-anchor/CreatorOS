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

function detectFormalLanguage(text: string): boolean {
  const formalPatterns = [
    /\bSie\b/,
    /\bIhnen\b/,
    /\bIhr\b/,
    /\bIhre\b/,
    /\bHerr\s+\w+/i,
    /\bFrau\s+\w+/i,
    /\bkönnten Sie\b/i,
    /\bwürden Sie\b/i,
  ];
  return formalPatterns.some((pattern) => pattern.test(text));
}

function hasLettersOrNumbers(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function isEmojiOnly(text: string): boolean {
  return !hasLettersOrNumbers((text || "").trim());
}

const CTA_PATTERNS = [
  /link\s+in\s+bio/i,
  /mehr\s+infos/i,
  /schau\s+mal\s+vorbei/i,
  /hier\s+klicken/i,
  /check\s+mal/i,
];

const SIGNATURE_PATTERNS = [
  /(^|\n)\s*lg\b[.!]?\s*$/im,
  /(^|\n)\s*(liebe|viele)?\s*grüße\b.*$/im,
  /(^|\n)\s*dein\s+(team|crew|support)\b.*$/im,
  /@support\b/i,
  /@team\b/i,
  /\bdein\s+antoine\b/i,
];

function validateReply(text: string) {
  const violations: string[] = [];
  const t = (text || "").trim();

  if (t.includes("#")) violations.push("Hashtag (#)");
  if (/\bwir\b|\buns\b|\bunser(e|)\b/i.test(t)) violations.push('"Wir/Uns/Unser"');
  if (CTA_PATTERNS.some((p) => p.test(t))) violations.push("CTA (z.B. Link in Bio)");
  if (SIGNATURE_PATTERNS.some((p) => p.test(t))) violations.push("Signatur (LG/@team/etc.)");

  return { ok: violations.length === 0, violations };
}

function sanitizeReply(text: string): string {
  let t = (text || "").trim();
  t = t.replace(/#\S+/g, " ").replace(/\s{2,}/g, " ").trim();
  t = t
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !SIGNATURE_PATTERNS.some((p) => p.test(line)))
    .join("\n")
    .trim();
  for (const p of CTA_PATTERNS) t = t.replace(p, "");
  return t.replace(/\s{2,}/g, " ").trim();
}

async function callLovableAi({
  lovableApiKey,
  model,
  systemPrompt,
  userMessage,
}: {
  lovableApiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<string> {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!resp.ok) {
    console.error("AI gateway error:", model, resp.status);
    return "⚠️ Fehler bei der Generierung";
  }

  const data = await resp.json();
  const reply = (data.choices?.[0]?.message?.content ?? "").trim();
  return reply || "⚠️ Keine Antwort generiert";
}

async function generateWithGuards({
  lovableApiKey,
  model,
  systemPrompt,
  userMessage,
}: {
  lovableApiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<string> {
  // Attempt #1
  let reply = await callLovableAi({ lovableApiKey, model, systemPrompt, userMessage });
  let v = validateReply(reply);
  if (v.ok) return reply;

  // Attempt #2
  const repairSystemPrompt = `${systemPrompt}\n\nWICHTIG: Du hast gegen Regeln verstoßen (${v.violations.join(", ")}).\nFormuliere KOMPLETT neu ohne diese Verstöße. NUR die korrigierte Antwort.`;
  reply = await callLovableAi({ lovableApiKey, model, systemPrompt: repairSystemPrompt, userMessage });
  v = validateReply(reply);
  if (v.ok) return reply;

  return sanitizeReply(reply);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick 3 unanswered comments
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

    // Fetch related post captions
    const mediaIds = [...new Set(comments.map((c) => c.ig_media_id).filter(Boolean))];
    const { data: posts } = await supabase
      .from("posts")
      .select("ig_media_id, caption")
      .in("ig_media_id", mediaIds);

    const postCaptionMap = new Map<string, string>();
    posts?.forEach((p) => {
      if (p.ig_media_id && p.caption) postCaptionMap.set(p.ig_media_id, p.caption);
    });

    const shuffled = comments.sort(() => Math.random() - 0.5);
    const selectedComments = shuffled.slice(0, 3);

    const { data: brandRules } = await supabase
      .from("brand_rules")
      .select("tone_style, writing_style, language_primary, formality_mode")
      .eq("user_id", user.id)
      .maybeSingle();

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Few-shot examples via service role (reply_queue)
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

    const validExamples = (pastReplies || [])
      .map((r) => (r.reply_text || "").trim())
      .filter((t) => t.length >= 3)
      .filter((t) => !isEmojiOnly(t))
      .slice(0, 20);

    const examplesBlock = validExamples.length
      ? validExamples.map((ex, i) => `${i + 1}. ${ex}`).join("\n")
      : "(keine Beispiele verfügbar)";

    const toneStyle = brandRules?.tone_style || "locker und authentisch";
    const writingStyle = brandRules?.writing_style || "";
    const language = brandRules?.language_primary || "DE";
    const formalityMode = brandRules?.formality_mode || "smart";

    const baseSystemPrompt = `ROLE: Du bist ICH (Antoine). Du bist kein Assistent und keine Marke.\n\nSTYLE-GUIDE (echte Beispiele von mir):\n${examplesBlock}\n\nANALYSE: Kopiere Vibe, Satzlänge, Kleinschreibung/Formatierung und Emoji-Nutzung dieser Beispiele so exakt wie möglich.\n\nREGELN (hart, niemals brechen):\n- Perspektive: IMMER 1. Person Singular (\"Ich\"). Niemals \"Wir/Uns/Unser\".\n- Keine Hashtags (#) – absolut verboten.\n- Keine Signaturen (z.B. \"LG\", \"Grüße\", \"Dein Team\", \"@support\", \"@team\").\n- Keine CTAs (\"Link in Bio\", \"schau mal vorbei\", \"mehr Infos\"), außer der Fan fragt explizit danach.\n- Schreibe kurz, natürlich, wie vom Handy (1–2 Sätze).\n\nSPRACHE: ${language === "DE" ? "Deutsch" : language}\nTONALITÄT: ${toneStyle}${writingStyle ? `\nSTIL-HINWEIS: ${writingStyle}` : ""}`;

    const results: Array<{
      commentId: string;
      commentText: string;
      commenterUsername: string;
      responses: Record<string, string>;
    }> = [];

    for (const comment of selectedComments) {
      const responses: Record<string, string> = {};

      const postCaption = postCaptionMap.get(comment.ig_media_id) || "";

      const fanUsesFormal = detectFormalLanguage(comment.comment_text);
      let formalityInstruction = "";
      if (formalityMode === "smart") {
        formalityInstruction = fanUsesFormal
          ? 'FORMALITÄT: Der Fan siezt → antworte mit "Sie".'
          : 'FORMALITÄT: Der Fan duzt → antworte mit "Du".';
      } else if (formalityMode === "sie") {
        formalityInstruction = 'FORMALITÄT: Antworte IMMER mit "Sie".';
      } else {
        formalityInstruction = 'FORMALITÄT: Antworte IMMER mit "Du".';
      }

      const systemPrompt = `${baseSystemPrompt}\nFORMALITÄT: ${formalityInstruction}`;

      const userMessage = `CONTEXT (du MUSST dich auf BEIDE Teile beziehen):\n\nA) POST-CAPTION (worum ging's?):\n\"\"\"${(postCaption || "").slice(0, 700)}\"\"\"\n\nB) FAN-KOMMENTAR (worauf antworte ich?):\n\"\"\"${comment.comment_text}\"\"\"\n\nAUFGABE: Antworte spezifisch auf den Fan-Kommentar, aber immer im Kontext der Caption. NUR die Antwort.`;

      const modelPromises = MODELS.map(async (m) => {
        console.log(`Generating response for comment ${comment.id} with model ${m.id}`);
        const reply = await generateWithGuards({
          lovableApiKey,
          model: m.id,
          systemPrompt,
          userMessage,
        });
        return { modelId: m.id, reply };
      });

      const modelResults = await Promise.all(modelPromises);
      for (const r of modelResults) responses[r.modelId] = r.reply;

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
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
