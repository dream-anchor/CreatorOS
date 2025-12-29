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

    const accessToken = connection.token_encrypted;
    const igUserId = connection.ig_user_id;

    // Get ALL assets for this post, ordered by created_at (for correct order)
    const { data: assets, error: assetError } = await supabase
      .from("assets")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (assetError || !assets || assets.length === 0) {
      await supabase
        .from("posts")
        .update({ status: "FAILED", error_message: "No images found for post" })
        .eq("id", postId);
      throw new Error("No images found for post");
    }

    console.log(`[publish-to-instagram] Found ${assets.length} assets for post`);

    // Build caption with hashtags
    let fullCaption = post.caption || "";
    if (post.hashtags) {
      fullCaption += "\n\n" + post.hashtags;
    }

    let igMediaId: string;

    // Check if this is a carousel (multiple images) or single image
    if (assets.length === 1) {
      // Single image post
      console.log("[publish-to-instagram] Publishing single image...");
      igMediaId = await publishSingleImage(
        igUserId,
        accessToken,
        assets[0].public_url,
        fullCaption,
        post.alt_text
      );
    } else {
      // Carousel post (2-10 images)
      console.log("[publish-to-instagram] Publishing carousel...");
      igMediaId = await publishCarousel(
        igUserId,
        accessToken,
        assets.map(a => a.public_url),
        fullCaption
      );
    }

    console.log(`[publish-to-instagram] Published! Media ID: ${igMediaId}`);

    // Update post status
    await supabase
      .from("posts")
      .update({
        status: "PUBLISHED",
        published_at: new Date().toISOString(),
        ig_media_id: igMediaId,
        error_message: null,
        format: assets.length > 1 ? "carousel" : "single",
      })
      .eq("id", postId);

    return new Response(
      JSON.stringify({
        success: true,
        ig_media_id: igMediaId,
        image_count: assets.length,
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

// Publish a single image
async function publishSingleImage(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
  altText?: string
): Promise<string> {
  // Step 1: Create media container
  console.log("[publish-to-instagram] Creating single image container...");
  const containerUrl = `https://graph.facebook.com/v18.0/${igUserId}/media`;
  const containerParams = new URLSearchParams({
    image_url: imageUrl,
    caption: caption,
    access_token: accessToken,
  });

  if (altText) {
    containerParams.append("alt_text", altText);
  }

  const containerResponse = await fetch(`${containerUrl}?${containerParams}`, {
    method: "POST",
  });

  const containerData = await containerResponse.json();

  if (containerData.error) {
    console.error("[publish-to-instagram] Container error:", containerData.error);
    throw new Error(containerData.error.message || "Failed to create media container");
  }

  const creationId = containerData.id;
  console.log(`[publish-to-instagram] Container created: ${creationId}`);

  // Wait for the container to be ready
  await waitForContainerReady(igUserId, accessToken, creationId);

  // Step 2: Publish the media
  return await publishMediaContainer(igUserId, accessToken, creationId);
}

// Publish a carousel (2-10 images)
async function publishCarousel(
  igUserId: string,
  accessToken: string,
  imageUrls: string[],
  caption: string
): Promise<string> {
  // Instagram carousel supports 2-10 items
  const validUrls = imageUrls.slice(0, 10);
  
  if (validUrls.length < 2) {
    throw new Error("Carousel requires at least 2 images");
  }

  console.log(`[publish-to-instagram] Creating ${validUrls.length} carousel items...`);

  // Step 1: Create individual media containers for each image
  const childContainerIds: string[] = [];

  for (let i = 0; i < validUrls.length; i++) {
    const imageUrl = validUrls[i];
    console.log(`[publish-to-instagram] Creating carousel item ${i + 1}/${validUrls.length}...`);

    const containerUrl = `https://graph.facebook.com/v18.0/${igUserId}/media`;
    const containerParams = new URLSearchParams({
      image_url: imageUrl,
      is_carousel_item: "true",
      access_token: accessToken,
    });

    const containerResponse = await fetch(`${containerUrl}?${containerParams}`, {
      method: "POST",
    });

    const containerData = await containerResponse.json();

    if (containerData.error) {
      console.error(`[publish-to-instagram] Carousel item ${i + 1} error:`, containerData.error);
      throw new Error(containerData.error.message || `Failed to create carousel item ${i + 1}`);
    }

    childContainerIds.push(containerData.id);
    console.log(`[publish-to-instagram] Carousel item ${i + 1} created: ${containerData.id}`);

    // Small delay between items to avoid rate limiting
    if (i < validUrls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Wait for all child containers to be ready
  console.log("[publish-to-instagram] Waiting for all carousel items to be ready...");
  for (const containerId of childContainerIds) {
    await waitForContainerReady(igUserId, accessToken, containerId);
  }

  // Step 2: Create the carousel container
  console.log("[publish-to-instagram] Creating carousel container...");
  const carouselUrl = `https://graph.facebook.com/v18.0/${igUserId}/media`;
  const carouselParams = new URLSearchParams({
    media_type: "CAROUSEL",
    caption: caption,
    children: childContainerIds.join(","),
    access_token: accessToken,
  });

  const carouselResponse = await fetch(`${carouselUrl}?${carouselParams}`, {
    method: "POST",
  });

  const carouselData = await carouselResponse.json();

  if (carouselData.error) {
    console.error("[publish-to-instagram] Carousel container error:", carouselData.error);
    throw new Error(carouselData.error.message || "Failed to create carousel container");
  }

  const carouselId = carouselData.id;
  console.log(`[publish-to-instagram] Carousel container created: ${carouselId}`);

  // Wait for carousel container to be ready
  await waitForContainerReady(igUserId, accessToken, carouselId);

  // Step 3: Publish the carousel
  return await publishMediaContainer(igUserId, accessToken, carouselId);
}

// Wait for a container to be ready (status = FINISHED)
async function waitForContainerReady(
  igUserId: string,
  accessToken: string,
  containerId: string,
  maxAttempts: number = 30
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusUrl = `https://graph.facebook.com/v18.0/${containerId}`;
    const statusParams = new URLSearchParams({
      fields: "status_code",
      access_token: accessToken,
    });

    const statusResponse = await fetch(`${statusUrl}?${statusParams}`);
    const statusData = await statusResponse.json();

    if (statusData.error) {
      console.error("[publish-to-instagram] Status check error:", statusData.error);
      throw new Error(statusData.error.message || "Failed to check container status");
    }

    const status = statusData.status_code;
    console.log(`[publish-to-instagram] Container ${containerId} status: ${status} (attempt ${attempt + 1})`);

    if (status === "FINISHED") {
      return;
    }

    if (status === "ERROR") {
      throw new Error("Container processing failed");
    }

    // Wait 2 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error("Container processing timeout");
}

// Publish the final media container
async function publishMediaContainer(
  igUserId: string,
  accessToken: string,
  creationId: string
): Promise<string> {
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
    throw new Error(publishData.error.message || "Failed to publish media");
  }

  return publishData.id;
}
