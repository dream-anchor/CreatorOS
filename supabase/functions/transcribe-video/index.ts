import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { project_id, audio_url } = body as { project_id: string; audio_url?: string };

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: "project_id ist erforderlich", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[transcribe-video] Starting transcription for project ${project_id}, audio_url=${audio_url ? "provided" : "none"}`);

    // Load project
    const { data: project, error: projectError } = await supabase
      .from("video_projects")
      .select("id, source_video_path, source_video_url, source_file_size")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Projekt nicht gefunden", success: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status
    await supabase
      .from("video_projects")
      .update({ status: "transcribing" })
      .eq("id", project_id);

    let fileData: Blob | null = null;
    let fileName = "audio.wav";
    let fileType = "audio/wav";

    // Priority: use pre-extracted audio_url if provided (client-side extracted WAV)
    if (audio_url) {
      console.log(`[transcribe-video] Downloading pre-extracted audio from: ${audio_url}`);
      const audioResponse = await fetch(audio_url);
      if (!audioResponse.ok) {
        console.error(`[transcribe-video] Audio download error: ${audioResponse.status}`);
        await supabase
          .from("video_projects")
          .update({ status: "failed", error_message: "Audio-Download fehlgeschlagen" })
          .eq("id", project_id);
        return new Response(
          JSON.stringify({ error: "Audio konnte nicht heruntergeladen werden", success: false }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      fileData = await audioResponse.blob();
      console.log(`[transcribe-video] Audio downloaded: ${(fileData.size / 1024 / 1024).toFixed(1)}MB`);
    } else {
      // Fallback: Download full video (only works for files < 25MB)
      const videoUrl = project.source_video_url;
      const isR2 = videoUrl && videoUrl.includes("r2.dev/");
      console.log(`[transcribe-video] No audio_url, downloading video from ${isR2 ? "R2" : "Supabase Storage"}`);

      fileName = "video.mp4";
      fileType = "video/mp4";

      if (isR2 && videoUrl) {
        const r2Response = await fetch(videoUrl);
        if (!r2Response.ok) {
          console.error(`[transcribe-video] R2 download error: ${r2Response.status}`);
          await supabase
            .from("video_projects")
            .update({ status: "failed", error_message: "Video-Download von R2 fehlgeschlagen" })
            .eq("id", project_id);
          return new Response(
            JSON.stringify({ error: "Video konnte nicht von R2 heruntergeladen werden", success: false }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        fileData = await r2Response.blob();
      } else {
        const { data: storageData, error: downloadError } = await supabase.storage
          .from("video-assets")
          .download(project.source_video_path);

        if (downloadError || !storageData) {
          console.error("[transcribe-video] Storage download error:", downloadError);
          await supabase
            .from("video_projects")
            .update({ status: "failed", error_message: "Video-Download fehlgeschlagen" })
            .eq("id", project_id);
          return new Response(
            JSON.stringify({ error: "Video konnte nicht heruntergeladen werden", success: false }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        fileData = storageData;
      }
    }

    if (!fileData) {
      return new Response(
        JSON.stringify({ error: "Keine Datei erhalten", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare FormData for Whisper API
    console.log(`[transcribe-video] Sending to Whisper API (${(fileData.size / 1024 / 1024).toFixed(1)}MB, type=${fileType})`);

    const formData = new FormData();
    formData.append("file", new File([fileData], fileName, { type: fileType }));
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
