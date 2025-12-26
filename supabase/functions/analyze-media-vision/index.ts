import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalysisResult {
  tags: string[];
  description: string;
  is_good_reference: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY nicht konfiguriert" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = authData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { mode, asset_id } = await req.json();

    let assetsToAnalyze: any[] = [];

    if (mode === "single" && asset_id) {
      // Analyze single asset
      const { data: asset } = await supabase
        .from("media_assets")
        .select("*")
        .eq("id", asset_id)
        .eq("user_id", user.id)
        .single();

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
        .limit(20); // Process max 20 at a time to avoid timeout

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

    console.log(`[analyze-media] Analyzing ${assetsToAnalyze.length} assets for user ${user.id}`);

    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];

    for (const asset of assetsToAnalyze) {
      if (!asset.public_url) {
        console.log(`[analyze-media] Skipping asset ${asset.id} - no public URL`);
        continue;
      }

      try {
        // Call GPT-4o Vision via Lovable AI Gateway
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
                content: `Du bist ein Bildanalyse-Experte. Analysiere Fotos für eine Social-Media Content-Erstellung.
Antworte NUR mit validem JSON ohne Markdown-Formatierung.`
              },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Analysiere dieses Foto. Ich brauche:
1. Tags für die Suche (z.B. Stimmung, Kleidung, Setting, Gesichtsausdruck)
2. Eine kurze Beschreibung (1-2 Sätze)
3. Ob es als Referenz für KI-Bildmontagen geeignet ist (gute Qualität, Gesicht klar erkennbar, keine Unschärfe)

Antworte NUR mit diesem JSON-Format:
{
  "tags": ["tag1", "tag2", "tag3"],
  "description": "Kurze Beschreibung des Bildes",
  "is_good_reference": true/false
}

Mögliche Tags für Stimmung: ernst, fröhlich, nachdenklich, cool, lustig, verrückt, professionell, entspannt, dramatisch, mysteriös
Mögliche Tags für Setting: outdoor, indoor, studio, natur, urban, set, behind-the-scenes, event
Mögliche Tags für Kleidung: casual, business, elegant, sportlich, kostüm`
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: asset.public_url
                    }
                  }
                ]
              }
            ],
            max_completion_tokens: 500,
          }),
        });

        if (!visionResponse.ok) {
          const errorText = await visionResponse.text();
          console.error(`[analyze-media] Vision API error for ${asset.id}:`, errorText);
          errorCount++;
          continue;
        }

        const visionData = await visionResponse.json();
        const content = visionData.choices?.[0]?.message?.content || "";

        console.log(`[analyze-media] Raw response for ${asset.id}:`, content);

        // Parse the JSON response
        let analysis: AnalysisResult;
        try {
          // Clean up the response - remove markdown code blocks if present
          let cleanContent = content.trim();
          if (cleanContent.startsWith("```json")) {
            cleanContent = cleanContent.slice(7);
          }
          if (cleanContent.startsWith("```")) {
            cleanContent = cleanContent.slice(3);
          }
          if (cleanContent.endsWith("```")) {
            cleanContent = cleanContent.slice(0, -3);
          }
          cleanContent = cleanContent.trim();

          analysis = JSON.parse(cleanContent);
        } catch (parseError) {
          console.error(`[analyze-media] JSON parse error for ${asset.id}:`, parseError, content);
          // Create fallback analysis
          analysis = {
            tags: ["unbekannt"],
            description: "Analyse konnte nicht durchgeführt werden",
            is_good_reference: false
          };
        }

        // Normalize tags to lowercase for consistent searching
        const normalizedTags = (analysis.tags || []).map((t: string) => 
          t.toLowerCase().trim()
        ).filter((t: string) => t.length > 0);

        // Update the asset in database
        const { error: updateError } = await supabase
          .from("media_assets")
          .update({
            ai_tags: normalizedTags,
            ai_description: analysis.description || null,
            is_good_reference: analysis.is_good_reference || false,
            analyzed: true,
          })
          .eq("id", asset.id);

        if (updateError) {
          console.error(`[analyze-media] Update error for ${asset.id}:`, updateError);
          errorCount++;
        } else {
          successCount++;
          results.push({
            id: asset.id,
            filename: asset.filename,
            tags: normalizedTags,
            description: analysis.description,
            is_good_reference: analysis.is_good_reference,
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (assetError) {
        console.error(`[analyze-media] Error analyzing ${asset.id}:`, assetError);
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
        message: `${successCount} Bilder erfolgreich analysiert${errorCount > 0 ? `, ${errorCount} Fehler` : ""}`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[analyze-media] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
