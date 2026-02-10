import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FrameInput {
  index: number;
  timestamp_ms: number;
  base64: string;
}

interface FrameAnalysisResult {
  frame_index: number;
  timestamp_ms: number;
  score: number;
  description: string;
  tags: string[];
  has_face: boolean;
  has_text: boolean;
  energy_level: "low" | "medium" | "high";
}

async function analyzeFrame(
  frame: FrameInput,
  lovableApiKey: string
): Promise<FrameAnalysisResult> {
  console.log(`[analyze-video-frames] Analyzing frame ${frame.index} at ${frame.timestamp_ms}ms`);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5",
      messages: [
        {
          role: "system",
          content: `Du bist ein Video-Analyse-Experte für Social Media Reels. Bewerte dieses Video-Frame nach seiner Eignung als Reel-Highlight. Nutze das Tool um die Ergebnisse zurückzugeben.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analysiere dieses Video-Frame (Timestamp: ${(frame.timestamp_ms / 1000).toFixed(1)}s):

1. SCORE (0-10): Wie visuell interessant und reel-tauglich ist dieses Frame?
   - 8-10: Starker Hook, emotionaler Moment, visuell beeindruckend
   - 5-7: Solider Content, gute Qualität
   - 0-4: Langweilig, unscharf, Übergang

2. BESCHREIBUNG: Was passiert in diesem Frame? (1 Satz)
3. TAGS: 3-5 beschreibende Tags
4. GESICHT: Ist ein Gesicht klar erkennbar?
5. TEXT: Ist Text/Schrift im Bild sichtbar?
6. ENERGIE: Wie dynamisch ist das Frame? (low/medium/high)`,
            },
            {
              type: "image_url",
              image_url: { url: frame.base64 },
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "analyze_video_frame",
            description: "Speichert die Frame-Analyse-Ergebnisse",
            parameters: {
              type: "object",
              properties: {
                score: {
                  type: "number",
                  description: "Visueller Interesse-Score 0-10",
                },
                description: {
                  type: "string",
                  description: "Kurze Beschreibung was im Frame passiert (1 Satz)",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "3-5 beschreibende Tags",
                },
                has_face: {
                  type: "boolean",
                  description: "Ist ein Gesicht klar erkennbar?",
                },
                has_text: {
                  type: "boolean",
                  description: "Ist Text/Schrift im Bild sichtbar?",
                },
                energy_level: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                  description: "Dynamik-Level des Frames",
                },
              },
              required: ["score", "description", "tags", "has_face", "has_text", "energy_level"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "analyze_video_frame" } },
      max_completion_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[analyze-video-frames] Vision API error: ${response.status} - ${errorText}`);
    throw new Error(`Vision API Fehler (${response.status})`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall || toolCall.function?.name !== "analyze_video_frame") {
    console.log("[analyze-video-frames] No tool call, returning default score");
    return {
      frame_index: frame.index,
      timestamp_ms: frame.timestamp_ms,
      score: 5,
      description: "Frame konnte nicht analysiert werden",
      tags: ["unbekannt"],
      has_face: false,
      has_text: false,
      energy_level: "medium",
    };
  }

  try {
    const args = JSON.parse(toolCall.function.arguments);
    return {
      frame_index: frame.index,
      timestamp_ms: frame.timestamp_ms,
      score: args.score ?? 5,
      description: args.description || "Analysiert",
      tags: args.tags || [],
      has_face: args.has_face ?? false,
      has_text: args.has_text ?? false,
      energy_level: args.energy_level || "medium",
    };
  } catch (parseError) {
    console.error("[analyze-video-frames] Parse error:", parseError);
    return {
      frame_index: frame.index,
      timestamp_ms: frame.timestamp_ms,
      score: 5,
      description: "Parse-Fehler bei Analyse",
      tags: [],
      has_face: false,
      has_text: false,
      energy_level: "medium",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase-Konfiguration fehlt", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY fehlt", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Nicht autorisiert", success: false }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Auth-Fehler", success: false }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = authData.user;
    const body = await req.json();
    const { project_id, frames } = body as { project_id: string; frames: FrameInput[] };

    if (!project_id || !frames || frames.length === 0) {
      return new Response(
        JSON.stringify({ error: "project_id und frames sind erforderlich", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[analyze-video-frames] Processing ${frames.length} frames for project ${project_id}`);

    // Verify project belongs to user
    const { data: project, error: projectError } = await supabase
      .from("video_projects")
      .select("id, status, frame_analysis")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Projekt nicht gefunden", success: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to analyzing
    await supabase
      .from("video_projects")
      .update({ status: "analyzing_frames" })
      .eq("id", project_id);

    // Analyze each frame with delay
    const results: FrameAnalysisResult[] = [];
    const existingAnalysis = project.frame_analysis || [];

    for (const frame of frames) {
      try {
        const analysis = await analyzeFrame(frame, lovableApiKey);
        results.push(analysis);
      } catch (err) {
        console.error(`[analyze-video-frames] Error on frame ${frame.index}:`, err);
        results.push({
          frame_index: frame.index,
          timestamp_ms: frame.timestamp_ms,
          score: 0,
          description: "Analyse fehlgeschlagen",
          tags: [],
          has_face: false,
          has_text: false,
          energy_level: "low",
        });
      }

      // Rate limiting delay
      if (frames.indexOf(frame) < frames.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    // Merge with existing analysis and update DB
    const mergedAnalysis = [...existingAnalysis, ...results];
    const { error: updateError } = await supabase
      .from("video_projects")
      .update({ frame_analysis: mergedAnalysis })
      .eq("id", project_id);

    if (updateError) {
      console.error("[analyze-video-frames] DB update error:", updateError);
      return new Response(
        JSON.stringify({ error: `DB-Fehler: ${updateError.message}`, success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[analyze-video-frames] Successfully analyzed ${results.length} frames`);

    return new Response(
      JSON.stringify({
        success: true,
        analyzed: results.length,
        total_frames: mergedAnalysis.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[analyze-video-frames] Unhandled error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
