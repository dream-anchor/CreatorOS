import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Helper to get day name in German
function getDayName(date: Date): string {
  const days = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  return days[date.getDay()];
}

// Helper to format date as DD.MM.YYYY
function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// Find the next free slot (day with no scheduled posts)
async function findNextFreeSlot(supabase: any, userId: string): Promise<Date> {
  const now = new Date();
  const currentHour = now.getHours();
  
  // If it's past 18:00, start from tomorrow
  let checkDate = new Date(now);
  if (currentHour >= 18) {
    checkDate.setDate(checkDate.getDate() + 1);
  }
  
  // Reset to start of day for comparison
  checkDate.setHours(0, 0, 0, 0);
  
  // Check up to 30 days ahead
  for (let i = 0; i < 30; i++) {
    const startOfDay = new Date(checkDate);
    const endOfDay = new Date(checkDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Check if there's any post scheduled for this day
    const { data: existingPosts, error } = await supabase
      .from("posts")
      .select("id")
      .eq("user_id", userId)
      .gte("scheduled_at", startOfDay.toISOString())
      .lte("scheduled_at", endOfDay.toISOString())
      .limit(1);
    
    if (error) {
      console.error("Error checking scheduled posts:", error);
      checkDate.setDate(checkDate.getDate() + 1);
      continue;
    }
    
    // If no posts found for this day, it's free!
    if (!existingPosts || existingPosts.length === 0) {
      const scheduledDate = new Date(checkDate);
      scheduledDate.setHours(18, 0, 0, 0);
      return scheduledDate;
    }
    
    checkDate.setDate(checkDate.getDate() + 1);
  }
  
  // Fallback: 30 days from now at 18:00
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 30);
  fallback.setHours(18, 0, 0, 0);
  return fallback;
}

// Helper to log errors to database
async function logError(
  supabase: any, 
  userId: string | null, 
  errorMessage: string, 
  details: Record<string, any>
) {
  try {
    // Only log if we have a userId
    if (userId) {
      await supabase.from("logs").insert({
        user_id: userId,
        event_type: "shortcut_upload_error",
        level: "error",
        details: {
          error: errorMessage,
          ...details,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (logError) {
    console.error("[shortcut-upload] Failed to log error:", logError);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const shortcutApiKey = Deno.env.get("SHORTCUT_API_KEY");

  // Capture request metadata for logging
  const userAgent = req.headers.get("user-agent") || "unknown";
  const contentLength = req.headers.get("content-length") || "unknown";

  // API Key Authentication
  const providedApiKey = req.headers.get("x-api-key");

  if (!shortcutApiKey) {
    console.error("[shortcut-upload] SHORTCUT_API_KEY not configured");
    return new Response(
      JSON.stringify({ success: false, error: "Server nicht konfiguriert" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!providedApiKey || providedApiKey !== shortcutApiKey) {
    console.error("[shortcut-upload] Invalid API key provided");
    return new Response(
      JSON.stringify({ success: false, error: "Ungültiger API-Key" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ========== GET Request: Test/Ping Endpoint ==========
  if (req.method === "GET") {
    console.log("[shortcut-upload] Test ping received - API key valid");
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Verbindung OK",
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // ========== POST Request: Main Upload Logic ==========
  let userId: string | null = null;

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const body = await req.json();
    const { files, rawText } = body;
    userId = body.userId;

    console.log(`[shortcut-upload] Request metadata - User-Agent: ${userAgent}, Content-Length: ${contentLength}`);

    if (!userId) {
      throw new Error("userId ist erforderlich");
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      await logError(supabase, userId, "Keine Bilder hochgeladen", {
        source: "ios_shortcut",
        userAgent,
        contentLength,
      });
      throw new Error("Keine Bilder hochgeladen");
    }

    console.log(`[shortcut-upload] Processing ${files.length} files for user ${userId}`);

    // Step 1: Determine format
    const format = files.length > 1 ? "carousel" : "single";
    console.log(`[shortcut-upload] Format detected: ${format}`);

    // Step 2: Upload files to storage
    const uploadedUrls: string[] = [];
    const slides: any[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name?.split(".").pop() || "jpg";
      const fileName = `${userId}/${crypto.randomUUID()}.${fileExt}`;

      // Decode base64 to Uint8Array
      const binaryString = atob(file.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let j = 0; j < binaryString.length; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("post-assets")
        .upload(fileName, bytes, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });

      if (uploadError) {
        console.error(`[shortcut-upload] Upload error for file ${i}:`, uploadError);
        await logError(supabase, userId, `Upload-Fehler: ${uploadError.message}`, {
          source: "ios_shortcut",
          fileIndex: i,
          filesTotal: files.length,
          userAgent,
        });
        throw new Error(`Fehler beim Hochladen: ${uploadError.message}`);
      }

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from("post-assets")
        .getPublicUrl(fileName);

      const publicUrl = publicUrlData.publicUrl;
      uploadedUrls.push(publicUrl);

      slides.push({
        index: i,
        image_url: publicUrl,
      });

      console.log(`[shortcut-upload] Uploaded file ${i + 1}/${files.length}: ${fileName}`);
    }

    // Step 3: Load brand rules for style context
    const { data: brandRules } = await supabase
      .from("brand_rules")
      .select("tone_style, writing_style, language_primary, hashtag_min, hashtag_max")
      .eq("user_id", userId)
      .maybeSingle();

    const toneStyle = brandRules?.tone_style || "locker und authentisch";
    const writingStyle = brandRules?.writing_style || "";
    const hashtagMin = brandRules?.hashtag_min || 8;
    const hashtagMax = brandRules?.hashtag_max || 15;

    // Step 4: Generate optimized caption using AI Vision
    console.log(`[shortcut-upload] Generating caption with AI...`);

    const systemPrompt = `Du bist ein Instagram Content-Creator. Dein Stil ist: ${toneStyle}.
${writingStyle ? `Zusätzlicher Stil-Hinweis: ${writingStyle}` : ""}

AUFGABE:
1. Analysiere das/die Bild(er) und verstehe den Kontext.
2. ${rawText ? `Schreibe den folgenden Rohtext um, sodass er authentisch und engaging klingt: "${rawText}"` : "Erstelle eine passende Caption basierend auf dem Bild."}
3. Füge ${hashtagMin}-${hashtagMax} relevante Hashtags hinzu.

FORMAT:
- Schreibe locker, wie für Instagram (keine steifen Formulierungen).
- Nutze Emojis sparsam aber effektiv.
- Die Caption sollte zum Engagement einladen (Frage, CTA, etc.).
- Hashtags am Ende, durch Leerzeilen getrennt.

Antworte NUR mit der fertigen Caption + Hashtags.`;

    // Build message with image(s)
    const userContent: any[] = [
      { type: "text", text: rawText ? `Rohtext: "${rawText}"` : "Erstelle eine passende Caption für dieses Bild." },
    ];

    // Add first image for vision analysis
    userContent.push({
      type: "image_url",
      image_url: { url: uploadedUrls[0] },
    });

    if (files.length > 1) {
      userContent[0].text += ` (Es handelt sich um ein Karussell mit ${files.length} Bildern.)`;
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[shortcut-upload] AI error:", errorText);
      await logError(supabase, userId, "AI-Generierung fehlgeschlagen", {
        source: "ios_shortcut",
        aiError: errorText,
        filesCount: files.length,
      });
      throw new Error("AI-Generierung fehlgeschlagen");
    }

    const aiData = await aiResponse.json();
    const generatedCaption = (aiData.choices?.[0]?.message?.content ?? "").trim();

    if (!generatedCaption) {
      await logError(supabase, userId, "Keine Caption generiert", {
        source: "ios_shortcut",
        filesCount: files.length,
      });
      throw new Error("Keine Caption generiert");
    }

    console.log(`[shortcut-upload] Generated caption: ${generatedCaption.substring(0, 100)}...`);

    // Step 5: Find next free slot (Gap-Filler Algorithm)
    const scheduledAt = await findNextFreeSlot(supabase, userId);
    const scheduledDay = getDayName(scheduledAt);
    const scheduledDateFormatted = formatDate(scheduledAt);

    console.log(`[shortcut-upload] Scheduling for: ${scheduledDay}, ${scheduledDateFormatted} at 18:00`);

    // Step 6: Create the post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        user_id: userId,
        status: "SCHEDULED",
        format: format,
        caption: generatedCaption,
        original_media_url: uploadedUrls[0],
        slides: format === "carousel" ? slides : null,
        scheduled_at: scheduledAt.toISOString(),
      })
      .select("id")
      .single();

    if (postError) {
      console.error("[shortcut-upload] Post creation error:", postError);
      await logError(supabase, userId, `Post-Erstellung fehlgeschlagen: ${postError.message}`, {
        source: "ios_shortcut",
        filesCount: files.length,
      });
      throw new Error(`Post konnte nicht erstellt werden: ${postError.message}`);
    }

    console.log(`[shortcut-upload] Post created: ${post.id}`);

    // Step 7: Create slide assets for carousel
    if (format === "carousel") {
      for (let i = 0; i < uploadedUrls.length; i++) {
        await supabase.from("slide_assets").insert({
          user_id: userId,
          post_id: post.id,
          slide_index: i,
          public_url: uploadedUrls[i],
        });
      }
      console.log(`[shortcut-upload] Created ${uploadedUrls.length} slide assets`);
    }

    // Step 8: Log the successful action
    await supabase.from("logs").insert({
      user_id: userId,
      post_id: post.id,
      event_type: "shortcut_upload",
      level: "info",
      details: {
        format,
        files_count: files.length,
        scheduled_for: scheduledAt.toISOString(),
        raw_text_provided: !!rawText,
        source: "ios_shortcut",
        userAgent,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        postId: post.id,
        format: format,
        caption: generatedCaption,
        scheduledAt: scheduledAt.toISOString(),
        scheduledDate: scheduledDateFormatted,
        scheduledDay: scheduledDay,
        imagesUploaded: uploadedUrls.length,
        message: `📸 Post eingeplant für ${scheduledDay}, ${scheduledDateFormatted} um 18:00 Uhr`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[shortcut-upload] Error:", error);
    
    // Log error if we have a userId
    if (userId) {
      await logError(supabase, userId, error instanceof Error ? error.message : "Unbekannter Fehler", {
        source: "ios_shortcut",
        userAgent,
        contentLength,
      });
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
