import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25MB

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase-Konfiguration fehlt", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY fehlt in den Secrets", success: false }),
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
    const { project_id } = body as { project_id: string };

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: "project_id ist erforderlich", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[transcribe-video] Starting transcription for project ${project_id}`);

    // Load project
    const { data: project, error: projectError } = await supabase
      .from("video_projects")
      .select("id, source_video_path, source_file_size")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Projekt nicht gefunden", success: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check file size
    if (project.source_file_size && project.source_file_size > WHISPER_MAX_BYTES) {
      return new Response(
        JSON.stringify({
          error: `Video ist zu groß für Transkription (${(project.source_file_size / 1024 / 1024).toFixed(1)}MB). Maximum: 25MB. Bitte kürze das Video vor dem Upload.`,
          success: false,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status
    await supabase
      .from("video_projects")
      .update({ status: "transcribing" })
      .eq("id", project_id);

    // Download video from storage
    console.log(`[transcribe-video] Downloading video from storage: ${project.source_video_path}`);
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("video-assets")
      .download(project.source_video_path);

    if (downloadError || !fileData) {
      console.error("[transcribe-video] Download error:", downloadError);
      await supabase
        .from("video_projects")
        .update({ status: "failed", error_message: "Video-Download fehlgeschlagen" })
        .eq("id", project_id);
      return new Response(
        JSON.stringify({ error: "Video konnte nicht heruntergeladen werden", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare FormData for Whisper API
    console.log(`[transcribe-video] Sending to Whisper API (${(fileData.size / 1024 / 1024).toFixed(1)}MB)`);

    const formData = new FormData();
    formData.append("file", new File([fileData], "video.mp4", { type: "video/mp4" }));
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    formData.append("language", "de");

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text();
      console.error(`[transcribe-video] Whisper API error: ${whisperResponse.status} - ${errorText}`);
      await supabase
        .from("video_projects")
        .update({ status: "failed", error_message: `Whisper-Fehler: ${whisperResponse.status}` })
        .eq("id", project_id);
      return new Response(
        JSON.stringify({ error: `Whisper API Fehler (${whisperResponse.status})`, success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const whisperData = await whisperResponse.json();
    console.log(`[transcribe-video] Whisper returned ${whisperData.words?.length || 0} words`);

    // Build transcript object
    const transcript = {
      text: whisperData.text || "",
      words: (whisperData.words || []).map((w: { word: string; start: number; end: number }) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      })),
      language: whisperData.language || "de",
    };

    // Store in DB
    const { error: updateError } = await supabase
      .from("video_projects")
      .update({ transcript })
      .eq("id", project_id);

    if (updateError) {
      console.error("[transcribe-video] DB update error:", updateError);
      return new Response(
        JSON.stringify({ error: `DB-Fehler: ${updateError.message}`, success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log event
    await supabase.from("logs").insert({
      user_id: user.id,
      level: "info",
      event_type: "video_transcribed",
      details: {
        project_id,
        word_count: transcript.words.length,
        language: transcript.language,
        text_length: transcript.text.length,
      },
    });

    console.log(`[transcribe-video] Successfully transcribed project ${project_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        transcript,
        word_count: transcript.words.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[transcribe-video] Unhandled error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
