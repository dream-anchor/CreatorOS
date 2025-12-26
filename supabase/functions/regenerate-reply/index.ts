import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- heuristics
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

// --- strict output guards
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
    const t = await resp.text();
    console.error("AI gateway error:", resp.status, t);
    throw new Error("AI generation failed");
  }

  const data = await resp.json();
  const reply = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!reply) throw new Error("Empty reply generated");
  return reply;
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

  console.warn("[regenerate-reply] Violations detected, regenerating:", v.violations);

  // Attempt #2 with explicit penalty
  const repairSystemPrompt = `${systemPrompt}\n\nWICHTIG: Du hast gegen Regeln verstoßen (${v.violations.join(", ")}).\nFormuliere die Antwort KOMPLETT neu ohne diese Verstöße.\nGib NUR die korrigierte Antwort zurück.`;

  reply = await callLovableAi({
    lovableApiKey,
    model,
    systemPrompt: repairSystemPrompt,
    userMessage,
  });

  v = validateReply(reply);
  if (v.ok) return reply;

  console.warn("[regenerate-reply] Still violating after regeneration, sanitizing:", v.violations);
  return sanitizeReply(reply);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const { data: authData, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    const user = authData?.user;
    if (authError || !user) throw new Error("Unauthorized");

    const { comment_id, model } = await req.json();
    if (!comment_id) throw new Error("comment_id required");

    const aiModel = model || "google/gemini-2.5-flash";
    console.log(`[regenerate-reply] Regenerating reply for comment ${comment_id} using model ${aiModel}`);

    // Load comment
    const { data: comment, error: commentError } = await supabase
      .from("instagram_comments")
      .select("id, user_id, comment_text, commenter_username, ig_media_id")
      .eq("id", comment_id)
      .eq("user_id", user.id)
      .single();

    if (commentError || !comment) throw new Error("Comment not found");

    // Load post caption
    let postCaption = "";
    if (comment.ig_media_id) {
      const { data: post } = await supabase
        .from("posts")
        .select("caption")
        .eq("ig_media_id", comment.ig_media_id)
        .maybeSingle();
      postCaption = post?.caption || "";
    }

    // Brand rules
    const { data: brandRules } = await supabase
      .from("brand_rules")
      .select("tone_style, writing_style, language_primary, formality_mode")
      .eq("user_id", user.id)
      .maybeSingle();

    const toneStyle = brandRules?.tone_style || "locker und authentisch";
    const writingStyle = brandRules?.writing_style || "";
    const language = brandRules?.language_primary || "DE";
    const formalityMode = brandRules?.formality_mode || "smart";

    // Few-shot examples from actual sent replies
    const { data: pastReplies } = await supabase
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

    // Smart formality
    const fanUsesFormal = detectFormalLanguage(comment.comment_text);
    let formalityInstruction = "";
    if (formalityMode === "smart") {
      formalityInstruction = fanUsesFormal
        ? 'Der Fan siezt ("Sie/Ihnen") → antworte ebenfalls mit "Sie".'
        : "Der Fan duzt → antworte mit \"Du\".";
    } else if (formalityMode === "sie") {
      formalityInstruction = "Antworte IMMER mit \"Sie\".";
    } else {
      formalityInstruction = "Antworte IMMER mit \"Du\".";
    }

    // System prompt (dynamic persona engine)
    const systemPrompt = `ROLE: Du bist ICH (Antoine). Du bist kein Assistent und keine Marke.\n\nSTYLE-GUIDE (echte Beispiele von mir):\n${examplesBlock}\n\nANALYSE: Kopiere Vibe, Satzlänge, Kleinschreibung/Formatierung und Emoji-Nutzung dieser Beispiele so exakt wie möglich.\n\nREGELN (hart, niemals brechen):\n- Perspektive: IMMER 1. Person Singular (\"Ich\"). Niemals \"Wir/Uns/Unser\".\n- Keine Hashtags (#) – absolut verboten.\n- Keine Signaturen (z.B. \"LG\", \"Grüße\", \"Dein Team\", \"@support\", \"@team\").\n- Keine CTAs (\"Link in Bio\", \"schau mal vorbei\", \"mehr Infos\"), außer der Fan fragt explizit danach.\n- Schreibe kurz, natürlich, wie vom Handy (1–2 Sätze).\n\nSPRACHE: ${language === "DE" ? "Deutsch" : language}\nTONALITÄT: ${toneStyle}${writingStyle ? `\nSTIL-HINWEIS: ${writingStyle}` : ""}\nFORMALITÄT: ${formalityInstruction}`;

    // User message (A/B context injection)
    const userMessage = `CONTEXT (du MUSST dich auf BEIDE Teile beziehen):\n\nA) POST-CAPTION (worum ging's?):\n\"\"\"${(postCaption || "").slice(0, 700)}\"\"\"\n\nB) FAN-KOMMENTAR (worauf antworte ich?):\n\"\"\"${comment.comment_text}\"\"\"\n\nAUFGABE: Antworte spezifisch auf den Fan-Kommentar, aber immer im Kontext der Caption. NUR die Antwort.`;

    const newReply = await generateWithGuards({
      lovableApiKey,
      model: aiModel,
      systemPrompt,
      userMessage,
    });

    console.log(`[regenerate-reply] New reply: ${newReply.substring(0, 60)}...`);

    const { error: updateError } = await supabase
      .from("instagram_comments")
      .update({ ai_reply_suggestion: newReply })
      .eq("id", comment_id);

    if (updateError) throw new Error("Failed to update comment");

    return new Response(JSON.stringify({ success: true, comment_id, new_reply: newReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[regenerate-reply] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
