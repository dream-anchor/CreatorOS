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
    const { postId, prompt } = await req.json();

    if (!postId || !prompt) {
      return new Response(
        JSON.stringify({ error: "postId and prompt are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .single();

    if (postError || !post) {
      throw new Error("Post not found");
    }

    console.log(`[generate-asset] Generating image for post ${postId}`);
    console.log(`[generate-asset] Prompt: ${prompt}`);

    // Call Lovable AI Image Generation
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: `Generate a professional Instagram feed post image. 
            
Requirements:
- Square format (1:1 aspect ratio)
- High quality, visually appealing
- Professional and clean design
- No text overlays unless specifically requested

Image description: ${prompt}`,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[generate-asset] AI error:", errorText);
      throw new Error("Image generation failed");
    }

    const data = await response.json();
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData || !imageData.startsWith("data:image")) {
      throw new Error("No image generated");
    }

    // Extract base64 data
    const base64Match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!base64Match) {
      throw new Error("Invalid image format");
    }

    const imageType = base64Match[1];
    const base64Data = base64Match[2];
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    // Upload to Supabase Storage
    const fileName = `${post.user_id}/${postId}/${Date.now()}.${imageType}`;
    
    const { error: uploadError } = await supabase.storage
      .from("post-assets")
      .upload(fileName, imageBytes, {
        contentType: `image/${imageType}`,
        upsert: true,
      });

    if (uploadError) {
      console.error("[generate-asset] Upload error:", uploadError);
      throw new Error("Failed to upload image");
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("post-assets")
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Save asset record
    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({
        user_id: post.user_id,
        post_id: postId,
        storage_path: fileName,
        public_url: publicUrl,
        width: 1080,
        height: 1080,
        source: "generate",
        generator_meta: { prompt },
      })
      .select()
      .single();

    if (assetError) {
      console.error("[generate-asset] Asset save error:", assetError);
      throw new Error("Failed to save asset");
    }

    // Log success
    await supabase.from("logs").insert({
      user_id: post.user_id,
      post_id: postId,
      event_type: "asset.generated",
      level: "info",
      details: { asset_id: asset.id, prompt },
    });

    console.log(`[generate-asset] Success! Asset ID: ${asset.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        asset,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[generate-asset] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
