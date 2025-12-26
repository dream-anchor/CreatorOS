import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GenerateImageRequest {
  theme: string;
  user_pose_description: string;
  reference_image_url: string;
  user_id: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { theme, user_pose_description, reference_image_url, user_id }: GenerateImageRequest = await req.json();

    if (!theme || !user_pose_description || !reference_image_url || !user_id) {
      throw new Error("Missing required fields: theme, user_pose_description, reference_image_url, user_id");
    }

    console.log("Generating personalized image:", { theme, user_pose_description, user_id });

    // Build the safe, copyright-free prompt
    const safePrompt = buildSafePrompt(theme, user_pose_description);
    
    console.log("Safe prompt constructed:", safePrompt);

    // Call Gemini image generation with the reference image
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
            content: [
              {
                type: "text",
                text: safePrompt.full_prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: reference_image_url
                }
              }
            ]
          }
        ],
        modalities: ["image", "text"]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Image generation API error:", errorText);
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("Image generation response received");

    // Extract the generated image
    const generatedImageBase64 = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!generatedImageBase64) {
      console.error("No image in response:", JSON.stringify(data));
      throw new Error("No image generated in response");
    }

    // Upload to Supabase storage
    const imageBuffer = base64ToArrayBuffer(generatedImageBase64.replace(/^data:image\/\w+;base64,/, ""));
    const fileName = `${user_id}/generated/${Date.now()}_personalized.png`;

    const { error: uploadError } = await supabase.storage
      .from("post-assets")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: false
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Failed to store image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("post-assets")
      .getPublicUrl(fileName);

    console.log("Image stored successfully:", urlData.publicUrl);

    return new Response(
      JSON.stringify({
        success: true,
        image_url: urlData.publicUrl,
        storage_path: fileName,
        prompt_used: safePrompt.display_prompt,
        theme: theme,
        safety_note: "Image generated using style parody - no copyrighted characters or logos included"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in generate-personalized-image:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

function buildSafePrompt(theme: string, poseDescription: string): { full_prompt: string; display_prompt: string } {
  // Map common themes to safe, generic style descriptions
  const themeStyleMap: Record<string, string> = {
    "matrix": "cyberpunk noir with green digital rain falling in the background, dark sunglasses, black coat",
    "sci-fi": "futuristic science fiction with neon lights and holographic displays",
    "80er": "vibrant 1980s aesthetic with neon colors, synthwave vibes, and retro-futuristic elements",
    "neon": "dramatic neon lighting with vivid pink, blue, and purple glows",
    "noir": "classic film noir style with dramatic shadows, venetian blind lighting, black and white tones",
    "western": "dusty western frontier setting with warm sunset tones and rugged landscape",
    "space": "cosmic space backdrop with stars, nebulae, and zero gravity effects",
    "retro": "vintage retro aesthetic with warm film grain and nostalgic color grading",
    "action": "dynamic action movie poster style with explosive lighting and dramatic pose",
    "comedy": "bright, colorful comedic style with exaggerated expressions and playful lighting",
    "horror": "atmospheric horror aesthetic with eerie lighting and foggy ambiance",
    "fantasy": "magical fantasy setting with mystical lighting and ethereal atmosphere"
  };

  // Find matching style or use theme directly
  const themeLower = theme.toLowerCase();
  let styleDescription = theme;
  
  for (const [key, value] of Object.entries(themeStyleMap)) {
    if (themeLower.includes(key)) {
      styleDescription = value;
      break;
    }
  }

  // Build the safe prompt with explicit copyright avoidance
  const negativeInstructions = `
CRITICAL RULES - YOU MUST FOLLOW:
- DO NOT include any recognizable characters, logos, or trademarked designs from movies, TV shows, or games
- DO NOT recreate specific scenes from copyrighted works
- DO NOT include text, titles, or brand names
- Create ORIGINAL artwork inspired by the STYLE only, not specific content
- The result should be a PARODY/HOMAGE style, not a copy
`;

  const positivePrompt = `
Create a high-quality, cinematic photograph in the style of: ${styleDescription}

Subject: Transform the person in the reference image into this scene.
Pose/Action: ${poseDescription}

Style requirements:
- Maintain the person's face and likeness from the reference image
- Apply the visual aesthetic and mood of the theme
- Use dramatic, professional lighting appropriate to the style
- Make it slightly humorous and exaggerated (parody style)
- High resolution, photorealistic quality
- The overall feel should be like a professional movie poster or promotional still

${negativeInstructions}
`;

  return {
    full_prompt: positivePrompt.trim(),
    display_prompt: `Style: ${styleDescription} | Pose: ${poseDescription}`
  };
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
