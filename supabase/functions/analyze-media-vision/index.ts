import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalysisResult {
  tags: string[];
  description: string;
  mood: string;
  is_good_reference: boolean;
}

// Use tool calling for reliable structured output
async function analyzeImage(imageUrl: string, lovableApiKey: string): Promise<AnalysisResult> {
  console.log(`[analyze-media] Calling Vision API for image: ${imageUrl.substring(0, 100)}...`);
  
  const visionResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
          content: `Du bist ein Bildanalyse-Experte. Analysiere das Foto und nutze das Tool um die Ergebnisse zurückzugeben.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analysiere dieses Foto:
- Erstelle 5 relevante Tags (Stimmung, Kleidung, Setting, Gesichtsausdruck)
- Schreibe eine kurze Beschreibung (1-2 Sätze)
- Bestimme die dominante Stimmung (Mood)
- Entscheide: Ist das Bild als Referenz für KI-Montagen geeignet? (Gesicht klar erkennbar, gute Qualität = true)`
            },
            {
              type: "image_url",
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "save_image_analysis",
            description: "Speichert die Bildanalyse-Ergebnisse",
            parameters: {
              type: "object",
              properties: {
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "5 relevante Tags für das Bild (z.B. portrait, ernst, outdoor, casual, nachdenklich)"
                },
                description: {
                  type: "string",
                  description: "Kurze Beschreibung des Bildinhalts (1-2 Sätze)"
                },
                mood: {
                  type: "string",
                  enum: ["Seriös", "Fröhlich", "Nachdenklich", "Cool", "Lustig", "Verrückt", "Professionell", "Entspannt", "Dramatisch", "Mysteriös", "Energetisch", "Verspielt"],
                  description: "Die dominante Stimmung des Bildes"
                },
                is_good_reference: {
                  type: "boolean",
                  description: "Ist das Bild als KI-Referenz geeignet? (Gesicht klar erkennbar, gute Qualität)"
                }
              },
              required: ["tags", "description", "mood", "is_good_reference"],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: { type: "function", function: { name: "save_image_analysis" } },
      max_completion_tokens: 1000,
    }),
  });

  if (!visionResponse.ok) {
    const errorText = await visionResponse.text();
    console.error(`[analyze-media] Vision API HTTP error: ${visionResponse.status} - ${errorText}`);
    throw new Error(`Vision API Fehler (${visionResponse.status}): ${errorText.substring(0, 200)}`);
  }

  const visionData = await visionResponse.json();
  console.log(`[analyze-media] Vision API response received`);

  // Extract tool call result
  const toolCall = visionData.choices?.[0]?.message?.tool_calls?.[0];
  
  if (!toolCall || toolCall.function?.name !== "save_image_analysis") {
    // Fallback: Try to parse from content if no tool call
    const content = visionData.choices?.[0]?.message?.content || "";
    console.log(`[analyze-media] No tool call found, trying content parsing. Content: ${content.substring(0, 200)}`);
    
    // Try to extract JSON from content as fallback
    try {
      let cleanContent = content.trim();
      if (cleanContent.includes("{")) {
        const jsonStart = cleanContent.indexOf("{");
        const jsonEnd = cleanContent.lastIndexOf("}");
        if (jsonStart !== -1 && jsonEnd !== -1) {
          cleanContent = cleanContent.substring(jsonStart, jsonEnd + 1);
          const parsed = JSON.parse(cleanContent);
          return {
            tags: parsed.tags || ["portrait"],
            description: parsed.description || "Bild analysiert",
            mood: parsed.mood || "Professionell",
            is_good_reference: parsed.is_good_reference ?? true
          };
        }
      }
    } catch (e) {
      console.log(`[analyze-media] Content parsing failed: ${e}`);
    }
    
    // Final fallback
    return {
      tags: ["portrait", "person"],
      description: "Automatisch analysiertes Bild",
      mood: "Professionell",
      is_good_reference: true
    };
  }

  // Parse tool call arguments
  try {
    const args = JSON.parse(toolCall.function.arguments);
    console.log(`[analyze-media] Successfully parsed tool call:`, args);
    return {
      tags: args.tags || ["portrait"],
      description: args.description || "Bild analysiert",
      mood: args.mood || "Professionell",
      is_good_reference: args.is_good_reference ?? true
    };
  } catch (parseError) {
    console.error(`[analyze-media] Tool call parse error:`, parseError, toolCall.function?.arguments);
    throw new Error(`Parsing-Fehler: ${parseError instanceof Error ? parseError.message : "Unbekannt"}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check secrets first
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!supabaseUrl || !supabaseKey) {
      console.error("[analyze-media] Missing Supabase credentials");
      return new Response(
        JSON.stringify({ error: "Supabase-Konfiguration fehlt", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!lovableApiKey) {
      console.error("[analyze-media] LOVABLE_API_KEY is missing!");
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY fehlt in den Secrets!", success: false }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert - kein Token", success: false }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError) {
      console.error("[analyze-media] Auth error:", authError);
      return new Response(JSON.stringify({ error: `Auth-Fehler: ${authError.message}`, success: false }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const user = authData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Benutzer nicht gefunden", success: false }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { mode, asset_id, image_url } = body;
    console.log(`[analyze-media] Request: mode=${mode}, asset_id=${asset_id}, user=${user.id}`);

    // Mode: "auto" - Analyze immediately after upload
    if (mode === "auto" && asset_id && image_url) {
      console.log(`[analyze-media] Auto-analyzing asset ${asset_id}`);
      
      try {
        const analysis = await analyzeImage(image_url, lovableApiKey);
        
        const normalizedTags = (analysis.tags || []).map((t: string) => 
          t.toLowerCase().trim()
        ).filter((t: string) => t.length > 0);

        const { error: updateError } = await supabase
          .from("media_assets")
          .update({
            ai_tags: normalizedTags,
            ai_description: analysis.description || null,
            mood: analysis.mood || null,
            is_good_reference: analysis.is_good_reference || false,
            analyzed: true,
          })
          .eq("id", asset_id)
          .eq("user_id", user.id);

        if (updateError) {
          console.error(`[analyze-media] DB Update error:`, updateError);
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Datenbank-Fehler: ${updateError.message}` 
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[analyze-media] Successfully analyzed asset ${asset_id}`);
        return new Response(
          JSON.stringify({
            success: true,
            asset_id,
            tags: normalizedTags,
            description: analysis.description,
            mood: analysis.mood,
            is_good_reference: analysis.is_good_reference,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[analyze-media] Auto analysis failed:`, errorMsg);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Analyse fehlgeschlagen: ${errorMsg}` 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Mode: "single" - Analyze a specific asset by ID
    let assetsToAnalyze: any[] = [];

    if (mode === "single" && asset_id) {
      const { data: asset, error: fetchError } = await supabase
        .from("media_assets")
        .select("*")
        .eq("id", asset_id)
        .eq("user_id", user.id)
        .single();

      if (fetchError) {
        return new Response(
          JSON.stringify({ success: false, error: `Bild nicht gefunden: ${fetchError.message}` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (asset) {
        assetsToAnalyze = [asset];
      }
    } else if (mode === "batch") {
      // Analyze all unanalyzed assets
      const { data: assets } = await supabase
        .from("media_assets")
        .select("*")
        .eq("user_id", user.id)
        .eq("analyzed", false)
        .order("created_at", { ascending: false })
        .limit(20);

      assetsToAnalyze = assets || [];
    }

    if (assetsToAnalyze.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          analyzed: 0, 
          message: "Keine unanalysierten Bilder gefunden" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[analyze-media] Batch analyzing ${assetsToAnalyze.length} assets`);

    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];
    const errors: string[] = [];

    for (const asset of assetsToAnalyze) {
      if (!asset.public_url) {
        console.log(`[analyze-media] Skipping asset ${asset.id} - no public URL`);
        errors.push(`${asset.filename || asset.id}: Keine URL`);
        errorCount++;
        continue;
      }

      try {
        const analysis = await analyzeImage(asset.public_url, lovableApiKey);

        const normalizedTags = (analysis.tags || []).map((t: string) => 
          t.toLowerCase().trim()
        ).filter((t: string) => t.length > 0);

        const { error: updateError } = await supabase
          .from("media_assets")
          .update({
            ai_tags: normalizedTags,
            ai_description: analysis.description || null,
            mood: analysis.mood || null,
            is_good_reference: analysis.is_good_reference || false,
            analyzed: true,
          })
          .eq("id", asset.id);

        if (updateError) {
          console.error(`[analyze-media] Update error for ${asset.id}:`, updateError);
          errors.push(`${asset.filename || asset.id}: DB-Fehler`);
          errorCount++;
        } else {
          successCount++;
          results.push({
            id: asset.id,
            filename: asset.filename,
            tags: normalizedTags,
            description: analysis.description,
            mood: analysis.mood,
            is_good_reference: analysis.is_good_reference,
          });
        }

        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 800));

      } catch (assetError) {
        const errorMsg = assetError instanceof Error ? assetError.message : String(assetError);
        console.error(`[analyze-media] Error analyzing ${asset.id}:`, errorMsg);
        errors.push(`${asset.filename || asset.id}: ${errorMsg}`);
        errorCount++;
      }
    }

    console.log(`[analyze-media] Completed: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        analyzed: successCount,
        errors: errorCount,
        total: assetsToAnalyze.length,
        results,
        errorDetails: errors.length > 0 ? errors : undefined,
        message: `${successCount} Bilder analysiert${errorCount > 0 ? `, ${errorCount} Fehler` : ""}`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[analyze-media] Unhandled error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg, success: false }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
