import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SegmentSelection {
  segment_index: number;
  start_ms: number;
  end_ms: number;
  score: number;
  reason: string;
  transcript_text: string;
  subtitle_text: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!supabaseUrl || !supabaseKey || !lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "Konfiguration fehlt", success: false }),
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
    const { project_id, target_duration_sec = 30 } = body as {
      project_id: string;
      target_duration_sec?: number;
    };

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: "project_id ist erforderlich", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[select-reel-segments] Selecting segments for project ${project_id}, target: ${target_duration_sec}s`);

    // Load project with analysis data
    const { data: project, error: projectError } = await supabase
      .from("video_projects")
      .select("id, frame_analysis, transcript, source_duration_ms")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Projekt nicht gefunden", success: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!project.frame_analysis || project.frame_analysis.length === 0) {
      return new Response(
        JSON.stringify({ error: "Keine Frame-Analyse vorhanden. Bitte zuerst Frames analysieren.", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status
    await supabase
      .from("video_projects")
      .update({ status: "selecting_segments" })
      .eq("id", project_id);

    // Build a summary of frame analysis for the AI
    const framesSummary = project.frame_analysis.map((f: {
      frame_index: number;
      timestamp_ms: number;
      score: number;
      description: string;
      tags: string[];
      energy_level: string;
      has_face: boolean;
    }) =>
      `[${(f.timestamp_ms / 1000).toFixed(1)}s] Score: ${f.score}/10 | ${f.description} | Tags: ${f.tags.join(", ")} | Energie: ${f.energy_level} | Gesicht: ${f.has_face ? "ja" : "nein"}`
    ).join("\n");

    // Build transcript summary
    let transcriptSummary = "Kein Transkript verfügbar.";
    if (project.transcript && project.transcript.text) {
      transcriptSummary = `Volltext: "${project.transcript.text}"\n\nWörter mit Timestamps:\n`;
      const words = project.transcript.words || [];
      // Group words into ~5-second chunks for readability
      let chunk = "";
      let chunkStart = 0;
      for (const w of words) {
        if (chunk === "") chunkStart = w.start;
        chunk += w.word + " ";
        if (w.end - chunkStart >= 5 || w === words[words.length - 1]) {
          transcriptSummary += `[${chunkStart.toFixed(1)}s - ${w.end.toFixed(1)}s]: ${chunk.trim()}\n`;
          chunk = "";
        }
      }
    }

    const videoDurationSec = project.source_duration_ms
      ? (project.source_duration_ms / 1000).toFixed(1)
      : "unbekannt";

    // Call AI for segment selection
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
            content: `Du bist ein professioneller Reel-Editor. Deine Aufgabe: Aus einem Rohvideo die besten Segmente auswählen, um ein packendes ${target_duration_sec}-Sekunden Instagram Reel zu erstellen.

Regeln:
- Jedes Segment sollte 3-8 Sekunden lang sein
- Die Gesamtdauer aller Segmente sollte ca. ${target_duration_sec} Sekunden ergeben
- Beginne mit einem starken Hook (hoher Score, Gesicht, oder überraschender Moment)
- Variiere zwischen Talking-Head und visuellen Momenten
- Untertitel sollten kurz, prägnant und reel-tauglich sein (max. 10 Wörter)
- Segmente dürfen sich NICHT überlappen
- Sortiere Segmente in der Reihenfolge, die narrativ am meisten Sinn ergibt

Nutze das Tool um deine Segment-Auswahl zurückzugeben.`,
          },
          {
            role: "user",
            content: `Video-Dauer: ${videoDurationSec}s
Ziel-Reel-Dauer: ${target_duration_sec}s

=== FRAME-ANALYSE ===
${framesSummary}

=== TRANSKRIPT ===
${transcriptSummary}

Wähle die besten Segmente für ein ${target_duration_sec}-Sekunden Reel.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "select_reel_segments",
              description: "Gibt die ausgewählten Reel-Segmente zurück",
              parameters: {
                type: "object",
                properties: {
                  segments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        segment_index: {
                          type: "integer",
                          description: "Reihenfolge im Reel (0-basiert)",
                        },
                        start_ms: {
                          type: "integer",
                          description: "Startzeit im Quellvideo in Millisekunden",
                        },
                        end_ms: {
                          type: "integer",
                          description: "Endzeit im Quellvideo in Millisekunden",
                        },
                        score: {
                          type: "number",
                          description: "Relevanz-Score 0-10",
                        },
                        reason: {
                          type: "string",
                          description: "Warum dieses Segment ausgewählt wurde (1 Satz)",
                        },
                        transcript_text: {
                          type: "string",
                          description: "Transkript-Ausschnitt für dieses Segment",
                        },
                        subtitle_text: {
                          type: "string",
                          description: "Kurzer, prägnanter Untertitel für das Reel (max 10 Wörter)",
                        },
                      },
                      required: ["segment_index", "start_ms", "end_ms", "score", "reason", "subtitle_text"],
                    },
                  },
                },
                required: ["segments"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "select_reel_segments" } },
        max_completion_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[select-reel-segments] AI error: ${response.status} - ${errorText}`);
      await supabase
        .from("video_projects")
        .update({ status: "failed", error_message: "KI-Segment-Auswahl fehlgeschlagen" })
        .eq("id", project_id);
      return new Response(
        JSON.stringify({ error: `KI-Fehler (${response.status})`, success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function?.name !== "select_reel_segments") {
      console.error("[select-reel-segments] No tool call returned");
      await supabase
        .from("video_projects")
        .update({ status: "failed", error_message: "KI hat keine Segmente zurückgegeben" })
        .eq("id", project_id);
      return new Response(
        JSON.stringify({ error: "KI hat keine Segmente ausgewählt", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let selectedSegments: SegmentSelection[];
    try {
      const args = JSON.parse(toolCall.function.arguments);
      selectedSegments = args.segments || [];
    } catch (parseError) {
      console.error("[select-reel-segments] Parse error:", parseError);
      await supabase
        .from("video_projects")
        .update({ status: "failed", error_message: "Segment-Daten konnten nicht geparst werden" })
        .eq("id", project_id);
      return new Response(
        JSON.stringify({ error: "Parse-Fehler bei Segment-Auswahl", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[select-reel-segments] AI selected ${selectedSegments.length} segments`);

    // Delete existing segments for this project (in case of re-run)
    await supabase
      .from("video_segments")
      .delete()
      .eq("project_id", project_id);

    // Insert segments into DB
    const segmentInserts = selectedSegments.map((seg) => ({
      project_id,
      user_id: user.id,
      segment_index: seg.segment_index,
      start_ms: seg.start_ms,
      end_ms: seg.end_ms,
      score: seg.score,
      reason: seg.reason || null,
      transcript_text: seg.transcript_text || null,
      subtitle_text: seg.subtitle_text || null,
      is_included: true,
      is_user_modified: false,
    }));

    const { data: insertedSegments, error: insertError } = await supabase
      .from("video_segments")
      .insert(segmentInserts)
      .select();

    if (insertError) {
      console.error("[select-reel-segments] Insert error:", insertError);
      await supabase
        .from("video_projects")
        .update({ status: "failed", error_message: `DB-Fehler: ${insertError.message}` })
        .eq("id", project_id);
      return new Response(
        JSON.stringify({ error: `DB-Fehler: ${insertError.message}`, success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update project status
    await supabase
      .from("video_projects")
      .update({ status: "segments_ready" })
      .eq("id", project_id);

    // Log event
    await supabase.from("logs").insert({
      user_id: user.id,
      level: "info",
      event_type: "reel_segments_selected",
      details: {
        project_id,
        segment_count: selectedSegments.length,
        total_duration_ms: selectedSegments.reduce((sum, s) => sum + (s.end_ms - s.start_ms), 0),
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        segments: insertedSegments,
        segment_count: selectedSegments.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[select-reel-segments] Unhandled error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
