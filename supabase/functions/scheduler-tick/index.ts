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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("[scheduler-tick] Looking for posts to publish...");

    // Find SCHEDULED posts where scheduled_at <= now
    const { data: postsToPublish, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("status", "SCHEDULED")
      .lte("scheduled_at", new Date().toISOString());

    if (fetchError) throw fetchError;

    console.log(`[scheduler-tick] Found ${postsToPublish?.length || 0} posts to publish`);

    const results = [];

    for (const post of postsToPublish || []) {
      try {
        // Call publish function
        const { data, error } = await supabase.functions.invoke("publish-to-instagram", {
          body: { postId: post.id },
        });

        if (error) throw error;

        results.push({ postId: post.id, success: true, result: data });

        // Log success
        await supabase.from("logs").insert({
          user_id: post.user_id,
          post_id: post.id,
          event_type: "post.published",
          level: "info",
          details: { ig_media_id: data?.ig_media_id },
        });
      } catch (publishError: unknown) {
        const errorMessage = publishError instanceof Error ? publishError.message : "Unknown error";
        console.error(`[scheduler-tick] Failed to publish post ${post.id}:`, errorMessage);

        results.push({ postId: post.id, success: false, error: errorMessage });

        // Log failure
        await supabase.from("logs").insert({
          user_id: post.user_id,
          post_id: post.id,
          event_type: "post.publish_failed",
          level: "error",
          details: { error: errorMessage },
        });
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[scheduler-tick] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
