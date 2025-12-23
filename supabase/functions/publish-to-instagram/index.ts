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
    const { postId } = await req.json();

    if (!postId) {
      return new Response(
        JSON.stringify({ error: "postId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log(`[publish-to-instagram] Publishing post ${postId}`);

    // Get the post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      throw new Error("Post not found");
    }

    // Get the meta connection
    const { data: connection, error: connError } = await supabase
      .from("meta_connections")
      .select("*")
      .eq("user_id", post.user_id)
      .single();

    if (connError || !connection) {
      throw new Error("Meta connection not found");
    }

    if (!connection.ig_user_id || !connection.token_encrypted) {
      throw new Error("Instagram not properly connected");
    }

    // Check if token is expired
    if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
      await supabase
        .from("posts")
        .update({ status: "FAILED", error_message: "Meta token expired" })
        .eq("id", postId);
      throw new Error("Meta token expired");
    }

    // Get the asset for this post
    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (assetError || !asset?.public_url) {
      await supabase
        .from("posts")
        .update({ status: "FAILED", error_message: "No image found for post" })
        .eq("id", postId);
      throw new Error("No image found for post");
    }

    const accessToken = connection.token_encrypted; // In production, decrypt this
    const igUserId = connection.ig_user_id;

    // Build caption with hashtags
    let fullCaption = post.caption || "";
    if (post.hashtags) {
      fullCaption += "\n\n" + post.hashtags;
    }

    // Step 1: Create media container
    console.log("[publish-to-instagram] Creating media container...");
    const containerUrl = `https://graph.facebook.com/v18.0/${igUserId}/media`;
    const containerParams = new URLSearchParams({
      image_url: asset.public_url,
      caption: fullCaption,
      access_token: accessToken,
    });

    // Add alt text if available
    if (post.alt_text) {
      containerParams.append("alt_text", post.alt_text);
    }

    const containerResponse = await fetch(`${containerUrl}?${containerParams}`, {
      method: "POST",
    });

    const containerData = await containerResponse.json();

    if (containerData.error) {
      console.error("[publish-to-instagram] Container error:", containerData.error);
      await supabase
        .from("posts")
        .update({ 
          status: "FAILED", 
          error_message: containerData.error.message || "Failed to create media container" 
        })
        .eq("id", postId);
      throw new Error(containerData.error.message || "Failed to create media container");
    }

    const creationId = containerData.id;
    console.log(`[publish-to-instagram] Container created: ${creationId}`);

    // Wait a bit for the container to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Step 2: Publish the media
    console.log("[publish-to-instagram] Publishing media...");
    const publishUrl = `https://graph.facebook.com/v18.0/${igUserId}/media_publish`;
    const publishParams = new URLSearchParams({
      creation_id: creationId,
      access_token: accessToken,
    });

    const publishResponse = await fetch(`${publishUrl}?${publishParams}`, {
      method: "POST",
    });

    const publishData = await publishResponse.json();

    if (publishData.error) {
      console.error("[publish-to-instagram] Publish error:", publishData.error);
      await supabase
        .from("posts")
        .update({ 
          status: "FAILED", 
          error_message: publishData.error.message || "Failed to publish media" 
        })
        .eq("id", postId);
      throw new Error(publishData.error.message || "Failed to publish media");
    }

    const igMediaId = publishData.id;
    console.log(`[publish-to-instagram] Published! Media ID: ${igMediaId}`);

    // Update post status
    await supabase
      .from("posts")
      .update({
        status: "PUBLISHED",
        published_at: new Date().toISOString(),
        ig_media_id: igMediaId,
        error_message: null,
      })
      .eq("id", postId);

    return new Response(
      JSON.stringify({
        success: true,
        ig_media_id: igMediaId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[publish-to-instagram] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
