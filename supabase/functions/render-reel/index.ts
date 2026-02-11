import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Segment {
  id: string;
  segment_index: number;
  start_ms: number;
  end_ms: number;
  subtitle_text: string | null;
  is_included: boolean;
}

function buildSubtitleHtml(text: string, style: string): string {
  const styles: Record<string, string> = {
    bold_center: `
      <div style="font-family: 'Montserrat', sans-serif; font-size: 48px; font-weight: 800;
        color: white; text-align: center; text-shadow: 2px 2px 8px rgba(0,0,0,0.8);
        padding: 10px 20px; line-height: 1.2; word-wrap: break-word; max-width: 900px;">
        ${text}
      </div>`,
    bottom_bar: `
      <div style="background: rgba(0,0,0,0.7); padding: 12px 24px; border-radius: 8px;
        font-family: 'Inter', sans-serif; font-size: 36px; font-weight: 600;
        color: white; text-align: center; max-width: 900px;">
        ${text}
      </div>`,
    karaoke: `
      <div style="font-family: 'Montserrat', sans-serif; font-size: 44px; font-weight: 800;
        color: #FFD700; text-align: center; text-shadow: 2px 2px 6px rgba(0,0,0,0.9);
        padding: 10px 20px; line-height: 1.2; max-width: 900px;">
        ${text}
      </div>`,
    minimal: `
      <div style="font-family: 'Inter', sans-serif; font-size: 28px; font-weight: 500;
        color: rgba(255,255,255,0.9); text-align: left; text-shadow: 1px 1px 4px rgba(0,0,0,0.6);
        padding: 8px 16px; max-width: 900px;">
        ${text}
      </div>`,
  };
  return styles[style] || styles.bold_center;
}

function mapTransition(style: string): Record<string, unknown> | undefined {
  const transitions: Record<string, Record<string, unknown>> = {
    smooth: { in: "fade", out: "fade" },
    fade: { in: "fade" },
    zoom: { in: "zoom" },
  };
  return transitions[style]; // 'cut' returns undefined = no transition
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const shotstackApiKey = Deno.env.get("SHOTSTACK_API_KEY");

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase-Konfiguration fehlt", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!shotstackApiKey) {
      return new Response(
        JSON.stringify({ error: "SHOTSTACK_API_KEY fehlt in den Secrets", success: false }),
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
    const {
      project_id,
      subtitle_style = "bold_center",
      transition_style = "smooth",
      render_mode = "individual",  // Default to individual for multi-clip workflow
    } = body as {
      project_id: string;
      subtitle_style?: string;
      transition_style?: string;
      render_mode?: "combined" | "individual";
    };

    if (!project_id) {
      return new Response(
        JSON.stringify({ error: "project_id ist erforderlich", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[render-reel] Starting render for project ${project_id}`);

    // Load project
    const { data: project, error: projectError } = await supabase
      .from("video_projects")
      .select("id, source_video_url")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: "Projekt nicht gefunden", success: false }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!project.source_video_url) {
      return new Response(
        JSON.stringify({ error: "Keine Quell-Video-URL vorhanden", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load included segments
    const { data: segments, error: segmentsError } = await supabase
      .from("video_segments")
      .select("*")
      .eq("project_id", project_id)
      .eq("is_included", true)
      .order("segment_index", { ascending: true });

    if (segmentsError || !segments || segments.length === 0) {
      return new Response(
        JSON.stringify({ error: "Keine Segmente ausgewählt", success: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status
    await supabase
      .from("video_projects")
      .update({ status: "rendering", subtitle_style, transition_style })
      .eq("id", project_id);

    const callbackUrl = `${supabaseUrl}/functions/v1/render-reel-callback`;
    const transition = mapTransition(transition_style);

    // INDIVIDUAL MODE: Render each segment as separate video
    if (render_mode === "individual") {
      const renderIds: string[] = [];

      for (const seg of segments) {
        const clipDuration = (seg.end_ms - seg.start_ms) / 1000;

        // Build video clip
        const videoClip: Record<string, unknown> = {
          asset: {
            type: "video",
            src: project.source_video_url,
            trim: seg.start_ms / 1000,
            volume: 1,
          },
          start: 0,
          length: clipDuration,
          fit: "cover",
        };
        if (transition) videoClip.transition = transition;

        // Build subtitle clip if exists
        const subtitleClip = seg.subtitle_text ? {
          asset: {
            type: "html",
            html: `<html><body style="margin:0; display:flex; align-items:flex-end; justify-content:center; height:100%;">${buildSubtitleHtml(seg.subtitle_text, subtitle_style)}</body></html>`,
            width: 1080,
            height: 400,
          },
          start: 0,
          length: clipDuration,
          position: "bottom",
          offset: { y: 0.08 },
        } : null;

        const edit = {
          timeline: {
            background: "#000000",
            tracks: subtitleClip ? [{ clips: [subtitleClip] }, { clips: [videoClip] }] : [{ clips: [videoClip] }],
          },
          output: {
            format: "mp4",
            resolution: "hd",
            aspectRatio: "9:16",
            fps: 30,
          },
          callback: callbackUrl,
        };

        console.log(`[render-reel] Individual mode - rendering segment ${seg.segment_index}`);

        // Call Shotstack Render API
        const renderResponse = await fetch("https://api.shotstack.io/edit/v1/render", {
          method: "POST",
          headers: {
            "x-api-key": shotstackApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(edit),
        });

        if (!renderResponse.ok) {
          const errorText = await renderResponse.text();
          console.error(`[render-reel] Shotstack error for segment ${seg.segment_index}: ${renderResponse.status} - ${errorText}`);
          await supabase
            .from("video_projects")
            .update({ status: "failed", error_message: `Shotstack-Fehler bei Segment ${seg.segment_index}` })
            .eq("id", project_id);
          return new Response(
            JSON.stringify({ error: `Shotstack Fehler (${renderResponse.status})`, success: false }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const renderData = await renderResponse.json();
        const renderId = renderData.response?.id;

        if (!renderId) {
          console.error(`[render-reel] No render ID for segment ${seg.segment_index}`);
          await supabase
            .from("video_projects")
            .update({ status: "failed", error_message: "Keine Render-ID von Shotstack erhalten" })
            .eq("id", project_id);
          return new Response(
            JSON.stringify({ error: "Keine Render-ID erhalten", success: false }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Save render record with segment_id
        await supabase.from("video_renders").insert({
          project_id,
          user_id: user.id,
          segment_id: seg.id,
          shotstack_render_id: renderId,
          shotstack_status: "queued",
          config_snapshot: edit,
          render_mode: "individual",
        });

        renderIds.push(renderId);
      }

      // Update project with first render ID (for backward compatibility)
      await supabase
        .from("video_projects")
        .update({ shotstack_render_id: renderIds[0] })
        .eq("id", project_id);

      // Log event
      await supabase.from("logs").insert({
        user_id: user.id,
        level: "info",
        event_type: "reel_render_started",
        details: { project_id, render_ids: renderIds, render_count: renderIds.length, render_mode: "individual" },
      });

      console.log(`[render-reel] Individual renders started: ${renderIds.length} clips`);

      return new Response(
        JSON.stringify({
          success: true,
          render_ids: renderIds,
          render_count: renderIds.length,
          render_mode: "individual",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // COMBINED MODE: Stitch all segments into one video (legacy)
    let cumulativeStart = 0;

    // Video clips track
    const videoClips = segments.map((seg: Segment) => {
      const clipDuration = (seg.end_ms - seg.start_ms) / 1000;
      const clip: Record<string, unknown> = {
        asset: {
          type: "video",
          src: project.source_video_url,
          trim: seg.start_ms / 1000,
          volume: 1,
        },
        start: cumulativeStart,
        length: clipDuration,
        fit: "cover",
      };
      if (transition) {
        clip.transition = transition;
      }
      cumulativeStart += clipDuration;
      return clip;
    });

    // Subtitle clips track
    cumulativeStart = 0;
    const subtitleClips = segments
      .filter((seg: Segment) => seg.subtitle_text)
      .map((seg: Segment) => {
        const clipDuration = (seg.end_ms - seg.start_ms) / 1000;
        // Find this segment's position in the timeline
        let segStart = 0;
        for (const s of segments) {
          if (s.id === seg.id) break;
          segStart += (s.end_ms - s.start_ms) / 1000;
        }
        return {
          asset: {
            type: "html",
            html: `<html><body style="margin:0; display:flex; align-items:flex-end; justify-content:center; height:100%;">${buildSubtitleHtml(seg.subtitle_text!, subtitle_style)}</body></html>`,
            width: 1080,
            height: 400,
          },
          start: segStart,
          length: clipDuration,
          position: "bottom",
          offset: { y: 0.08 },
        };
      });

    const edit = {
      timeline: {
        background: "#000000",
        tracks: [
          { clips: subtitleClips }, // Subtitles on top
          { clips: videoClips },    // Video below
        ],
      },
      output: {
        format: "mp4",
        resolution: "hd",
        aspectRatio: "9:16",
        fps: 30,
      },
      callback: callbackUrl,
    };

    console.log(`[render-reel] Combined mode - sending to Shotstack: ${segments.length} clips, callback: ${callbackUrl}`);

    // Call Shotstack Render API
    const renderResponse = await fetch("https://api.shotstack.io/edit/v1/render", {
      method: "POST",
      headers: {
        "x-api-key": shotstackApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(edit),
    });

    if (!renderResponse.ok) {
      const errorText = await renderResponse.text();
      console.error(`[render-reel] Shotstack error: ${renderResponse.status} - ${errorText}`);
      await supabase
        .from("video_projects")
        .update({ status: "failed", error_message: `Shotstack-Fehler: ${renderResponse.status}` })
        .eq("id", project_id);
      return new Response(
        JSON.stringify({ error: `Shotstack Fehler (${renderResponse.status})`, success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const renderData = await renderResponse.json();
    const renderId = renderData.response?.id;

    if (!renderId) {
      console.error("[render-reel] No render ID returned:", renderData);
      await supabase
        .from("video_projects")
        .update({ status: "failed", error_message: "Keine Render-ID von Shotstack erhalten" })
        .eq("id", project_id);
      return new Response(
        JSON.stringify({ error: "Keine Render-ID erhalten", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save render record
    await supabase.from("video_renders").insert({
      project_id,
      user_id: user.id,
      shotstack_render_id: renderId,
      shotstack_status: "queued",
      config_snapshot: edit,
      render_mode: "combined",
    });

    // Update project with render ID
    await supabase
      .from("video_projects")
      .update({ shotstack_render_id: renderId })
      .eq("id", project_id);

    // Log event
    await supabase.from("logs").insert({
      user_id: user.id,
      level: "info",
      event_type: "reel_render_started",
      details: { project_id, render_id: renderId, segment_count: segments.length, render_mode: "combined" },
    });

    console.log(`[render-reel] Combined render started: ${renderId}`);

    return new Response(
      JSON.stringify({
        success: true,
        render_id: renderId,
        segment_count: segments.length,
        render_mode: "combined",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[render-reel] Unhandled error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
