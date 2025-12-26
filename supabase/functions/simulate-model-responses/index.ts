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

    // Get 3 random unanswered comments
    const { data: comments, error: commentsError } = await supabase
      .from("instagram_comments")
      .select("id, comment_text, commenter_username")
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

    // Shuffle and pick 3 random comments
    const shuffled = comments.sort(() => Math.random() - 0.5);
    const selectedComments = shuffled.slice(0, 3);

    // Get brand rules for context
    const { data: brandRules } = await supabase
      .from("brand_rules")
      .select("tone_style, writing_style, language_primary, do_list, dont_list")
      .eq("user_id", user.id)
      .maybeSingle();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build system prompt
    const toneStyle = brandRules?.tone_style || "freundlich und authentisch";
    const writingStyle = brandRules?.writing_style || "";
    const language = brandRules?.language_primary || "DE";
    const doList = brandRules?.do_list?.join(", ") || "";
    const dontList = brandRules?.dont_list?.join(", ") || "";

    const systemPrompt = `Du bist ein Social-Media-Manager und antwortest auf Instagram-Kommentare.
Sprache: ${language === "DE" ? "Deutsch" : language}
Ton: ${toneStyle}
${writingStyle ? `Schreibstil: ${writingStyle}` : ""}
${doList ? `Was du tun sollst: ${doList}` : ""}
${dontList ? `Was du vermeiden sollst: ${dontList}` : ""}

Schreibe kurze, authentische Antworten (1-2 Sätze). Nutze passende Emojis sparsam.`;

    // Generate responses for each comment from each model
    const results: Array<{
      commentId: string;
      commentText: string;
      commenterUsername: string;
      responses: Record<string, string>;
    }> = [];

    for (const comment of selectedComments) {
      const responses: Record<string, string> = {};

      // Generate from all models in parallel
      const modelPromises = MODELS.map(async (model) => {
        try {
          console.log(`Generating response for comment ${comment.id} with model ${model.id}`);
          
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
                { 
                  role: "user", 
                  content: `Beantworte diesen Instagram-Kommentar von @${comment.commenter_username || "Fan"}:\n\n"${comment.comment_text}"` 
                },
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
