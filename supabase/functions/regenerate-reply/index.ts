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

// --- Tone detection: Sincere vs Humorous ---
type CommentTone = "sincere" | "humorous" | "neutral";

function detectCommentTone(commentText: string): CommentTone {
  const text = (commentText || "").toLowerCase().trim();
  
  // Patterns indicating SINCERE/EARNEST comments (require heartfelt, simple responses)
  const sincerePatterns = [
    // Compliments about relationships/people
    /süßes?\s*paar/i,
    /schönes?\s*paar/i,
    /tolles?\s*paar/i,
    /niedliches?\s*paar/i,
    /perfektes?\s*paar/i,
    /traumhaftes?\s*paar/i,
    /ihr\s+passt\s+.*zusammen/i,
    /ihr\s+seid\s+.*süß/i,
    /ihr\s+seid\s+.*toll/i,
    /ihr\s+seid\s+.*schön/i,
    // Personal compliments
    /du\s+bist\s+.*schön/i,
    /du\s+bist\s+.*toll/i,
    /du\s+bist\s+.*super/i,
    /du\s+bist\s+.*inspirierend/i,
    /du\s+bist\s+.*wunderbar/i,
    /du\s+bist\s+.*fantastisch/i,
    // Gratulations/wishes
    /herzlichen\s+glückwunsch/i,
    /alles\s+gute/i,
    /viel\s+glück/i,
    /viel\s+erfolg/i,
    /freut\s+mich\s+für/i,
    /ich\s+wünsche/i,
    /glückwunsch/i,
    // Condolences/support
    /mein\s+beileid/i,
    /tut\s+mir\s+leid/i,
    /gute\s+besserung/i,
    /bleib\s+stark/i,
    /ich\s+denke?\s+an\s+dich/i,
    // Appreciation/thanks
    /vielen\s+dank/i,
    /danke\s+für/i,
    /inspirierst\s+mich/i,
    /macht\s+mich\s+glücklich/i,
    /berührt\s+mich/i,
    // Serious questions
    /wie\s+hast\s+du\s+.*geschafft/i,
    /woher\s+hast\s+du/i,
    /kannst\s+du\s+mir\s+.*erklären/i,
    /was\s+rätst\s+du/i,
    /darf\s+ich\s+.*fragen/i,
    /hätte\s+.*frage/i,
    // Pure positive affirmations (not joke-like)
    /respekt/i,
    /bewundere/i,
    /großartig/i,
    /wunderschön/i,
    /bezaubernd/i,
  ];
  
  // Patterns indicating HUMOROUS context (playful banter ok)
  const humorPatterns = [
    /haha/i,
    /😂/,
    /🤣/,
    /lol/i,
    /rofl/i,
    /witzig/i,
    /lustig/i,
    /zu\s+geil/i,
    /mega\s+geil/i,
    /krass/i,
    /digga/i,
    /alter/i,
    /ey\s/i,
    /diggi/i,
  ];
  
  // Check for sincere patterns first (they take priority)
  for (const pattern of sincerePatterns) {
    if (pattern.test(text)) {
      return "sincere";
    }
  }
  
  // Check for humor patterns
  for (const pattern of humorPatterns) {
    if (pattern.test(text)) {
      return "humorous";
    }
  }
  
  return "neutral";
}

function getToneInstruction(tone: CommentTone): string {
  switch (tone) {
    case "sincere":
      return `\n\nWICHTIG - TON-ANPASSUNG (HERZLICH/ERNST):
Der Kommentar ist ein ernstes Kompliment, eine herzliche Nachricht oder eine ernsthafte Frage.
→ Antworte WARMHERZIG und AUFRICHTIG, NICHT witzig oder flapsig.
→ Ein einfaches "Vielen Dank! 🙏😊" oder "Das bedeutet mir sehr viel, danke! 🙌" ist perfekt.
→ Sei kurz, herzlich und authentisch - keine Witze, keine übertriebene Coolness.
→ Zeige echte Wertschätzung für das nette Feedback.`;
    
    case "humorous":
      return `\n\nTON-ANPASSUNG (HUMORVOLL):
Der Kommentar hat einen lockeren, lustigen Vibe.
→ Du kannst gerne witzig und spielerisch antworten.
→ Humor und Banter sind hier willkommen!`;
    
    default:
      return ""; // Neutral = use default tone from brand rules
  }
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

// Expanded emoji mapping for forbidden terms
const EMOJI_TERM_MAP: Record<string, RegExp> = {
  // Herz/Liebe
  "herz": /[❤️💕💖💗💘💝💓💞💟🖤🤍🤎💙💚💛🧡💜🩷🩵🩶♥️💌]/gu,
  "heart": /[❤️💕💖💗💘💝💓💞💟🖤🤍🤎💙💚💛🧡💜🩷🩵🩶♥️💌]/gu,
  "liebe": /[❤️💕💖💗💘💝💓💞💟🖤🤍🤎💙💚💛🧡💜🩷🩵🩶♥️💌😍🥰💑💏]/gu,
  "love": /[❤️💕💖💗💘💝💓💞💟🖤🤍🤎💙💚💛🧡💜🩷🩵🩶♥️💌😍🥰💑💏]/gu,
  // Kitsch (Sterne, Glitzer, übertriebene Deko)
  "kitsch": /[✨🌟💫⭐🌠🎀🦋🌸🌺🌷🌹🌼💐🎆🎇🏵️]/gu,
  "glitzer": /[✨🌟💫⭐🌠🎆🎇]/gu,
  "sparkle": /[✨🌟💫⭐🌠🎆🎇]/gu,
  // Feuer
  "feuer": /🔥/gu,
  "fire": /🔥/gu,
  // Kuss
  "kuss": /[💋😘😗😚😙]/gu,
  "kiss": /[💋😘😗😚😙]/gu,
};

function buildForbiddenEmojiRegex(nogoTerms: string[]): RegExp | null {
  const patterns: string[] = [];
  for (const term of nogoTerms) {
    const lowerTerm = term.toLowerCase();
    const mapped = EMOJI_TERM_MAP[lowerTerm];
    if (mapped) {
      patterns.push(mapped.source);
    }
  }
  if (patterns.length === 0) return null;
  return new RegExp(patterns.join("|"), "gu");
}

function validateReply(text: string, forbiddenEmojiRegex: RegExp | null = null) {
  const violations: string[] = [];
  const t = (text || "").trim();

  if (t.includes("#")) violations.push("Hashtag (#)");
  if (/\bwir\b|\buns\b|\bunser(e|)\b/i.test(t)) violations.push('"Wir/Uns/Unser"');
  if (CTA_PATTERNS.some((p) => p.test(t))) violations.push("CTA (z.B. Link in Bio)");
  if (SIGNATURE_PATTERNS.some((p) => p.test(t))) violations.push("Signatur (LG/@team/etc.)");
  if (forbiddenEmojiRegex && forbiddenEmojiRegex.test(t)) violations.push("Verbotene Emojis");

  return { ok: violations.length === 0, violations };
}

function sanitizeReply(text: string, forbiddenEmojiRegex: RegExp | null = null): string {
  let t = (text || "").trim();
  t = t.replace(/#\S+/g, " ").replace(/\s{2,}/g, " ").trim();
  t = t
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !SIGNATURE_PATTERNS.some((p) => p.test(line)))
    .join("\n")
    .trim();
  for (const p of CTA_PATTERNS) t = t.replace(p, "");
  
  // Remove forbidden emojis
  if (forbiddenEmojiRegex) {
    t = t.replace(forbiddenEmojiRegex, "");
  }
  
  return t.replace(/\s{2,}/g, " ").trim();
}

// Helper to validate if an image URL is accessible (excludes videos)
async function isImageUrlValid(url: string | null | undefined): Promise<boolean> {
  if (!url) return false;
  
  // Quick check: exclude video file extensions
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.mp4') || lowerUrl.includes('.mov') || lowerUrl.includes('.avi') || lowerUrl.includes('.webm')) {
    console.log('[regenerate-reply] Skipping video URL:', url.substring(0, 100));
    return false;
  }
  
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type') || '';
    
    // Only accept image content types, NOT video
    const isImage = contentType.startsWith('image/') && 
      (contentType.includes('jpeg') || contentType.includes('png') || contentType.includes('webp') || contentType.includes('gif'));
    
    if (!isImage && response.ok) {
      console.log('[regenerate-reply] Unsupported content-type:', contentType);
    }
    
    return response.ok && isImage;
  } catch {
    return false;
  }
}

async function callLovableAi({
  lovableApiKey,
  model,
  systemPrompt,
  userMessage,
  imageUrl,
}: {
  lovableApiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  imageUrl?: string | null;
}): Promise<string> {
  // Build messages - use multimodal if image is provided
  let messages: any[];
  
  if (imageUrl) {
    messages = [
      { role: "system", content: systemPrompt },
      { 
        role: "user", 
        content: [
          { type: "text", text: userMessage },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      },
    ];
  } else {
    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
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
  imageUrl,
  forbiddenEmojiRegex,
}: {
  lovableApiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  imageUrl?: string | null;
  forbiddenEmojiRegex?: RegExp | null;
}): Promise<string> {
  // Attempt #1
  let reply = await callLovableAi({ lovableApiKey, model, systemPrompt, userMessage, imageUrl });
  let v = validateReply(reply, forbiddenEmojiRegex);
  if (v.ok) return reply;

  console.warn("[regenerate-reply] Violations detected, regenerating:", v.violations);

  // Attempt #2 with explicit penalty
  const repairSystemPrompt = `${systemPrompt}\n\nWICHTIG: Du hast gegen Regeln verstoßen (${v.violations.join(", ")}).\nFormuliere die Antwort KOMPLETT neu ohne diese Verstöße.\nGib NUR die korrigierte Antwort zurück.`;

  reply = await callLovableAi({
    lovableApiKey,
    model,
    systemPrompt: repairSystemPrompt,
    userMessage,
    imageUrl,
  });

  v = validateReply(reply, forbiddenEmojiRegex);
  if (v.ok) return reply;

  console.warn("[regenerate-reply] Still violating after regeneration, sanitizing:", v.violations);
  return sanitizeReply(reply, forbiddenEmojiRegex);
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

    // Load post data including image URL
    let postCaption = "";
    let imageUrl: string | null = null;
    let postFormat: string | null = null;
    
    if (comment.ig_media_id) {
      const { data: post } = await supabase
        .from("posts")
        .select("caption, original_media_url, format")
        .eq("ig_media_id", comment.ig_media_id)
        .maybeSingle();
      
      postCaption = post?.caption || "";
      imageUrl = post?.original_media_url || null;
      postFormat = post?.format || null;
    }

    // Validate image URL
    let validatedImageUrl: string | null = null;
    if (imageUrl) {
      const isValid = await isImageUrlValid(imageUrl);
      if (isValid) {
        validatedImageUrl = imageUrl;
        console.log(`[regenerate-reply] Using vision mode with image for comment ${comment_id}`);
      } else {
        console.log(`[regenerate-reply] Image URL invalid/expired, falling back to text-only`);
      }
    }

    // Brand rules
    const { data: brandRules } = await supabase
      .from("brand_rules")
      .select("tone_style, writing_style, language_primary, formality_mode")
      .eq("user_id", user.id)
      .maybeSingle();

    // Load emoji nogo terms
    const { data: emojiNogoTerms } = await supabase
      .from("emoji_nogo_terms")
      .select("term")
      .eq("user_id", user.id);

    const emojiNogoList = emojiNogoTerms?.map((t: any) => t.term) || [];
    console.log(`[regenerate-reply] Loaded ${emojiNogoList.length} emoji nogo terms:`, emojiNogoList);

    // Build emoji constraint for the prompt
    let emojiConstraint = "";
    let forbiddenEmojiRegex: RegExp | null = null;
    if (emojiNogoList.length > 0) {
      forbiddenEmojiRegex = buildForbiddenEmojiRegex(emojiNogoList);
      emojiConstraint = `\n\nEMOJI-EINSCHRÄNKUNG (ABSOLUT VERBOTEN!):\nDie folgenden Emojis sind STRIKT VERBOTEN und dürfen NIEMALS verwendet werden:\n- Verbotene Kategorien: ${emojiNogoList.join(", ")}\n- Das bedeutet z.B.: KEINE ❤️ 💕 💖 💗 💘 💝 oder andere Herz-Emojis wenn "Herz" oder "Liebe" verboten ist\n- KEINE ✨ 🌟 💫 wenn "Kitsch" verboten ist\nWENN du eines dieser Emojis verwendest, wird die Antwort ABGELEHNT.\nNutze NUR neutrale Alternativen wie: 🙌 👍 😎 💪 🎯 👏 ⚡ 🚀 💯`;
    }

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

    // Detect comment tone for appropriate response style
    const commentTone = detectCommentTone(comment.comment_text);
    const toneInstruction = getToneInstruction(commentTone);
    console.log(`[regenerate-reply] Comment ${comment_id} detected tone: ${commentTone}`);

    // Vision-enhanced section
    const visionSection = validatedImageUrl ? `
===== VISUELLER KONTEXT (WICHTIG!) =====
Ein Bild des Posts ist beigefügt.
ANALYSIERE das Bild: Was ist darauf zu sehen? (Landschaft, Person, Essen, Tier, Selfie, Produkt, etc.)
NUTZE diese Info für eine kontextbezogene Antwort!
Beispiel: Wenn jemand "Wow!" schreibt und auf dem Bild ist ein Hund → Antworte: "Ja, er ist echt süß, oder? 🐕"
========================================` : '';

    // System prompt (dynamic persona engine)
    const systemPrompt = `ROLE: Du bist ICH (Antoine). Du bist kein Assistent und keine Marke.\n\nSTYLE-GUIDE (echte Beispiele von mir):\n${examplesBlock}\n\nANALYSE: Kopiere Vibe, Satzlänge, Kleinschreibung/Formatierung und Emoji-Nutzung dieser Beispiele so exakt wie möglich.\n\nREGELN (hart, niemals brechen):\n- Perspektive: IMMER 1. Person Singular (\"Ich\"). Niemals \"Wir/Uns/Unser\".\n- Keine Hashtags (#) – absolut verboten.\n- Keine Signaturen (z.B. \"LG\", \"Grüße\", \"Dein Team\", \"@support\", \"@team\").\n- Keine CTAs (\"Link in Bio\", \"schau mal vorbei\", \"mehr Infos\"), außer der Fan fragt explizit danach.\n- Schreibe kurz, natürlich, wie vom Handy (1–2 Sätze).${emojiConstraint}\n\nSPRACHE: ${language === "DE" ? "Deutsch" : language}\nTONALITÄT: ${toneStyle}${writingStyle ? `\nSTIL-HINWEIS: ${writingStyle}` : ""}\nFORMALITÄT: ${formalityInstruction}${toneInstruction}${visionSection}`;

    // User message (A/B context injection) - mention image if present
    const imageContextHint = validatedImageUrl ? "\n\nC) BILD (siehe beigefügtes Bild - beschreibe was du siehst und beziehe dich darauf!)" : "";
    const userMessage = `CONTEXT (du MUSST dich auf BEIDE Teile beziehen):\n\nA) POST-CAPTION (worum ging's?):\n\"\"\"${(postCaption || "").slice(0, 700)}\"\"\"\n\nB) FAN-KOMMENTAR (worauf antworte ich?):\n\"\"\"${comment.comment_text}\"\"\"${imageContextHint}\n\nAUFGABE: Antworte spezifisch auf den Fan-Kommentar, aber immer im Kontext der Caption${validatedImageUrl ? " und des Bildes" : ""}. NUR die Antwort.`;

    const newReply = await generateWithGuards({
      lovableApiKey,
      model: aiModel,
      systemPrompt,
      userMessage,
      imageUrl: validatedImageUrl,
      forbiddenEmojiRegex,
    });

    console.log(`[regenerate-reply] New reply (vision: ${!!validatedImageUrl}): ${newReply.substring(0, 60)}...`);

    const { error: updateError } = await supabase
      .from("instagram_comments")
      .update({ ai_reply_suggestion: newReply })
      .eq("id", comment_id);

    if (updateError) throw new Error("Failed to update comment");

    return new Response(JSON.stringify({ 
      success: true, 
      comment_id, 
      new_reply: newReply,
      vision_enabled: !!validatedImageUrl
    }), {
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
