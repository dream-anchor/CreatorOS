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

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase-Konfiguration fehlt" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // No Bearer auth - this is a webhook from Shotstack
    // Validate by looking up the render ID in our DB
    const webhookData = await req.json();
    const { id: renderId, status, url } = webhookData;

    console.log(`[render-reel-callback] Received webhook: render=${renderId}, status=${status}`);

    if (!renderId) {
      return new Response(
        JSON.stringify({ error: "Keine Render-ID im Webhook" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the render record
    const { data: render, error: renderError } = await supabase
      .from("video_renders")
      .select("id, project_id, user_id")
      .eq("shotstack_render_id", renderId)
      .single();

    if (renderError || !render) {
      console.error(`[render-reel-callback] Unknown render ID: ${renderId}`);
      return new Response(
        JSON.stringify({ error: "Unbekannte Render-ID" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (status === "done" && url) {
      console.log(`[render-reel-callback] Render complete, downloading from: ${url}`);

      // Download rendered video from Shotstack CDN
      const videoResponse = await fetch(url);
      if (!videoResponse.ok) {
        console.error(`[render-reel-callback] Download failed: ${videoResponse.status}`);
        await supabase
          .from("video_renders")
          .update({ shotstack_status: "failed", error_message: "Video-Download von CDN fehlgeschlagen" })
          .eq("id", render.id);
        await supabase
          .from("video_projects")
          .update({ status: "failed", error_message: "Rendered Video konnte nicht heruntergeladen werden" })
          .eq("id", render.project_id);
        return new Response(
          JSON.stringify({ error: "Download fehlgeschlagen" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const videoBuffer = new Uint8Array(await videoResponse.arrayBuffer());
      const storagePath = `${render.user_id}/reels/${render.project_id}/${Date.now()}.mp4`;

      console.log(`[render-reel-callback] Uploading to storage: ${storagePath} (${(videoBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("video-assets")
        .upload(storagePath, videoBuffer, {
          contentType: "video/mp4",
          upsert: true,
        });

      if (uploadError) {
        console.error("[render-reel-callback] Upload error:", uploadError);
        await supabase
          .from("video_renders")
          .update({ shotstack_status: "failed", error_message: `Storage-Upload: ${uploadError.message}` })
          .eq("id", render.id);
        await supabase
          .from("video_projects")
          .update({ status: "failed", error_message: "Video konnte nicht gespeichert werden" })
          .eq("id", render.project_id);
        return new Response(
          JSON.stringify({ error: "Upload fehlgeschlagen" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: urlData } = supabase.storage
        .from("video-assets")
        .getPublicUrl(storagePath);

      // Update render record
      await supabase
        .from("video_renders")
        .update({
          shotstack_status: "done",
          output_url: url,
          stored_video_path: storagePath,
          stored_video_url: urlData.publicUrl,
          completed_at: new Date().toISOString(),
        })
        .eq("id", render.id);

      // Check render mode to determine project completion logic
      const { data: renderDetails } = await supabase
        .from("video_renders")
        .select("render_mode")
        .eq("id", render.id)
        .single();

      // For INDIVIDUAL mode: Only set project complete when ALL renders are done
      if (renderDetails?.render_mode === "individual") {
        const { data: allRenders } = await supabase
          .from("video_renders")
          .select("shotstack_status")
          .eq("project_id", render.project_id)
          .eq("render_mode", "individual");

        const allComplete = allRenders?.every(r => r.shotstack_status === "done") || false;
        const anyFailed = allRenders?.some(r => r.shotstack_status === "failed") || false;

        if (allComplete) {
          await supabase
            .from("video_projects")
            .update({
              status: "render_complete",
              rendered_video_path: storagePath,
              rendered_video_url: urlData.publicUrl,
            })
            .eq("id", render.project_id);

          await supabase.from("logs").insert({
            user_id: render.user_id,
            level: "info",
            event_type: "reel_render_complete",
            details: {
              project_id: render.project_id,
              render_mode: "individual",
              render_count: allRenders?.length || 0,
            },
          });

          console.log(`[render-reel-callback] All ${allRenders?.length || 0} individual renders complete`);
        } else if (anyFailed) {
          await supabase
            .from("video_projects")
            .update({ status: "failed", error_message: "Einer oder mehrere Clips konnten nicht gerendert werden" })
            .eq("id", render.project_id);

          console.log(`[render-reel-callback] Some individual renders failed`);
        } else {
          console.log(`[render-reel-callback] Individual render ${renderId} complete, waiting for others`);
        }
      } else {
        // COMBINED mode: Set project complete immediately
        await supabase
          .from("video_projects")
          .update({
            status: "render_complete",
            rendered_video_path: storagePath,
            rendered_video_url: urlData.publicUrl,
          })
          .eq("id", render.project_id);

        await supabase.from("logs").insert({
          user_id: render.user_id,
          level: "info",
          event_type: "reel_render_complete",
          details: {
            project_id: render.project_id,
            render_id: renderId,
            video_url: urlData.publicUrl,
            file_size_bytes: videoBuffer.length,
          },
        });

        console.log(`[render-reel-callback] Combined render complete: ${urlData.publicUrl}`);
      }
    } else if (status === "failed") {
      console.error(`[render-reel-callback] Render failed: ${renderId}`);

      const errorMsg = webhookData.error || "Shotstack Rendering fehlgeschlagen";

      await supabase
        .from("video_renders")
        .update({
          shotstack_status: "failed",
          error_message: errorMsg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", render.id);

      // Check render mode to handle failures appropriately
      const { data: renderDetails } = await supabase
        .from("video_renders")
        .select("render_mode")
        .eq("id", render.id)
        .single();

      // For individual mode, only fail project if ALL renders have finished
      if (renderDetails?.render_mode === "individual") {
        const { data: allRenders } = await supabase
          .from("video_renders")
          .select("shotstack_status")
          .eq("project_id", render.project_id)
          .eq("render_mode", "individual");

        const allFinished = allRenders?.every(r => r.shotstack_status === "done" || r.shotstack_status === "failed") || false;
        const anySuccessful = allRenders?.some(r => r.shotstack_status === "done") || false;

        if (allFinished && !anySuccessful) {
          // All failed - mark project as failed
          await supabase
            .from("video_projects")
            .update({ status: "failed", error_message: "Alle Clips konnten nicht gerendert werden" })
            .eq("id", render.project_id);

          console.log(`[render-reel-callback] All individual renders failed`);
        } else if (allFinished && anySuccessful) {
          // Some succeeded - mark as complete (partial success)
          await supabase
            .from("video_projects")
            .update({ status: "render_complete" })
            .eq("id", render.project_id);

          console.log(`[render-reel-callback] Some individual renders succeeded, some failed - partial success`);
        }
        // If not all finished, keep status as "rendering" and wait for other callbacks
      } else {
        // COMBINED mode: Fail immediately
        await supabase
          .from("video_projects")
          .update({ status: "failed", error_message: errorMsg })
          .eq("id", render.project_id);
      }

      await supabase.from("logs").insert({
        user_id: render.user_id,
        level: "error",
        event_type: "reel_render_failed",
        details: { project_id: render.project_id, render_id: renderId, error: errorMsg },
      });
    } else {
      // Intermediate status (rendering, saving, etc.) - just update
      console.log(`[render-reel-callback] Intermediate status: ${status}`);
      await supabase
        .from("video_renders")
        .update({ shotstack_status: status })
        .eq("id", render.id);
    }

    return new Response(
      JSON.stringify({ success: true, status }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[render-reel-callback] Unhandled error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
