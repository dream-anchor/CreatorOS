import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

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

// Compress image using ImageScript - resize to max 1920px and convert to JPEG
async function compressImage(base64Data: string): Promise<{ data: Uint8Array; originalSize: number; compressedSize: number }> {
  // Decode base64 to binary
  const binaryString = atob(base64Data);
  const originalSize = binaryString.length;
  const bytes = new Uint8Array(originalSize);
  for (let i = 0; i < originalSize; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Decode image with ImageScript
  const image = await Image.decode(bytes);
  
  const maxDimension = 1920;
  const width = image.width;
  const height = image.height;
  
  // Resize if larger than maxDimension
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      const newHeight = Math.round((height / width) * maxDimension);
      image.resize(maxDimension, newHeight);
    } else {
      const newWidth = Math.round((width / height) * maxDimension);
      image.resize(newWidth, maxDimension);
    }
    console.log(`[shortcut-upload] Resized from ${width}x${height} to ${image.width}x${image.height}`);
  }

  // Encode as JPEG with 85% quality
  const compressed = await image.encodeJPEG(85);
  const compressedSize = compressed.length;
  
  console.log(`[shortcut-upload] Compressed: ${Math.round(originalSize / 1024)}KB -> ${Math.round(compressedSize / 1024)}KB (${Math.round((1 - compressedSize / originalSize) * 100)}% reduction)`);
  
  return { data: compressed, originalSize, compressedSize };
}

// Process a single file - with compression
async function processAndUploadFile(
  supabase: any,
  userId: string,
  base64Data: string,
  fileName: string,
  _contentType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  // Compress the image before uploading
  const { data: compressedData } = await compressImage(base64Data);
  
  // Always use .jpg extension after compression
  const compressedFileName = fileName.replace(/\.[^.]+$/, '.jpg');

  const { error: uploadError } = await supabase.storage
    .from("post-assets")
    .upload(compressedFileName, compressedData, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Upload-Fehler: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from("post-assets")
    .getPublicUrl(compressedFileName);

  return {
    storagePath: compressedFileName,
    publicUrl: publicUrlData.publicUrl,
  };
}

// Create final post from session data
async function createPostFromSession(
  supabase: any,
  session: any,
  lovableApiKey: string,
  userAgent: string
): Promise<{ success: boolean; postId?: string; message?: string; error?: string }> {
  const userId = session.user_id;
  const uploadedFiles = session.uploaded_files as { storagePath: string; publicUrl: string }[];
  const rawText = session.raw_text;
  const parsedCollaborators = session.collaborators || [];

  console.log(`[shortcut-upload] Creating post from session with ${uploadedFiles.length} files`);

  // Determine format
  const format = uploadedFiles.length > 1 ? "carousel" : "single";
  const uploadedUrls = uploadedFiles.map(f => f.publicUrl);

  // Build slides
  const slides = uploadedFiles.map((f, i) => ({
    index: i,
    image_url: f.publicUrl,
  }));

  // Load brand rules for style context
  const { data: brandRules } = await supabase
    .from("brand_rules")
    .select("tone_style, writing_style, language_primary, hashtag_min, hashtag_max")
    .eq("user_id", userId)
    .maybeSingle();

  const toneStyle = brandRules?.tone_style || "locker und authentisch";
  const writingStyle = brandRules?.writing_style || "";
  const hashtagMin = brandRules?.hashtag_min || 8;
  const hashtagMax = brandRules?.hashtag_max || 15;

  // Generate optimized caption using AI Vision
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

  // Build message with image(s) - use URL instead of base64
  const userContent: any[] = [
    { type: "text", text: rawText ? `Rohtext: "${rawText}"` : "Erstelle eine passende Caption für dieses Bild." },
  ];

  // Add first image for vision analysis (using URL, not base64)
  userContent.push({
    type: "image_url",
    image_url: { url: uploadedUrls[0] },
  });

  if (uploadedFiles.length > 1) {
    userContent[0].text += ` (Es handelt sich um ein Karussell mit ${uploadedFiles.length} Bildern.)`;
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
      aiError: errorText.substring(0, 500),
      filesCount: uploadedFiles.length,
    });
    return { success: false, error: "AI-Generierung fehlgeschlagen" };
  }

  const aiData = await aiResponse.json();
  const generatedCaption = (aiData.choices?.[0]?.message?.content ?? "").trim();

  if (!generatedCaption) {
    await logError(supabase, userId, "Keine Caption generiert", {
      source: "ios_shortcut",
      filesCount: uploadedFiles.length,
    });
    return { success: false, error: "Keine Caption generiert" };
  }

  console.log(`[shortcut-upload] Generated caption: ${generatedCaption.substring(0, 100)}...`);

  // Find next free slot (Gap-Filler Algorithm)
  const scheduledAt = await findNextFreeSlot(supabase, userId);
  const scheduledDay = getDayName(scheduledAt);
  const scheduledDateFormatted = formatDate(scheduledAt);

  console.log(`[shortcut-upload] Scheduling for: ${scheduledDay}, ${scheduledDateFormatted} at 18:00`);

  // Create the post
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
      collaborators: parsedCollaborators,
    })
    .select("id")
    .single();

  if (postError) {
    console.error("[shortcut-upload] Post creation error:", postError);
    await logError(supabase, userId, `Post-Erstellung fehlgeschlagen: ${postError.message}`, {
      source: "ios_shortcut",
      filesCount: uploadedFiles.length,
    });
    return { success: false, error: `Post konnte nicht erstellt werden: ${postError.message}` };
  }

  console.log(`[shortcut-upload] Post created: ${post.id}`);

  // Link uploaded images to the post (planner reads assets(*))
  const { error: assetsError } = await supabase.from("assets").insert(
    uploadedFiles.map((f) => ({
      user_id: userId,
      post_id: post.id,
      storage_path: f.storagePath,
      public_url: f.publicUrl,
    })),
  );

  if (assetsError) {
    console.error("[shortcut-upload] Assets creation error:", assetsError);
    await logError(supabase, userId, `Assets-Erstellung fehlgeschlagen: ${assetsError.message}`, {
      source: "ios_shortcut",
      postId: post.id,
      filesCount: uploadedFiles.length,
    });
  }

  // Create slide assets for carousel (keeps order)
  if (format === "carousel") {
    for (let i = 0; i < uploadedFiles.length; i++) {
      await supabase.from("slide_assets").insert({
        user_id: userId,
        post_id: post.id,
        slide_index: i,
        public_url: uploadedFiles[i].publicUrl,
        storage_path: uploadedFiles[i].storagePath,
      });
    }
    console.log(`[shortcut-upload] Created ${uploadedFiles.length} slide assets`);
  }

  // Mark session as completed
  await supabase
    .from("upload_sessions")
    .update({ is_completed: true })
    .eq("session_id", session.session_id);

  // Log the successful action
  await supabase.from("logs").insert({
    user_id: userId,
    post_id: post.id,
    event_type: "shortcut_upload",
    level: "info",
    details: {
      format,
      files_count: uploadedFiles.length,
      scheduled_for: scheduledAt.toISOString(),
      raw_text_provided: !!rawText,
      collaborators: parsedCollaborators,
      source: "ios_shortcut",
      userAgent,
      mode: "session",
    },
  });

  const message = parsedCollaborators.length > 0 
    ? `📸 Collab-Post eingeplant für ${scheduledDay}, ${scheduledDateFormatted} um 18:00 Uhr (mit ${parsedCollaborators.join(", ")})`
    : `📸 Post eingeplant für ${scheduledDay}, ${scheduledDateFormatted} um 18:00 Uhr`;

  return {
    success: true,
    postId: post.id,
    message,
  };
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

    // Parse body and immediately extract what we need
    const bodyText = await req.text();
    let parsedBody;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch (parseError) {
      console.error("[shortcut-upload] JSON parse error");
      return new Response(
        JSON.stringify({ success: false, error: "Ungültiges JSON-Format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { files, rawText, collaborators, sessionId, imageIndex, totalImages } = parsedBody;
    userId = parsedBody.userId;

    // Parse collaborators (remove @ symbols if present)
    const parsedCollaborators: string[] = Array.isArray(collaborators) 
      ? collaborators.map((c: string) => c.replace(/^@/, '').trim()).filter(Boolean)
      : [];

    console.log(`[shortcut-upload] Request - User-Agent: ${userAgent}, Files: ${files?.length || 0}, SessionId: ${sessionId || 'none'}, ImageIndex: ${imageIndex ?? 'N/A'}, TotalImages: ${totalImages ?? 'N/A'}`);

    if (!userId) {
      throw new Error("userId ist erforderlich");
    }

    // ========== SESSION MODE: Sequential upload with session tracking ==========
    if (sessionId !== undefined && imageIndex !== undefined && totalImages !== undefined) {
      console.log(`[shortcut-upload] Session mode: image ${imageIndex + 1}/${totalImages}, sessionId: ${sessionId}`);

      // Validate we have exactly one file
      if (!files || !Array.isArray(files) || files.length !== 1) {
        return new Response(
          JSON.stringify({ success: false, error: "Im Session-Modus muss genau 1 Bild pro Request gesendet werden" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Upload the single file
      const file = files[0];
      const fileExt = "jpg";
      const fileName = `${userId}/${crypto.randomUUID()}.${fileExt}`;

      console.log(`[shortcut-upload] Uploading image...`);

      const uploadResult = await processAndUploadFile(
        supabase,
        userId,
        file.base64,
        fileName,
        file.type || "image/jpeg"
      );

      console.log(`[shortcut-upload] Uploaded: ${uploadResult.publicUrl}`);

      // SIMPLE MODE: If totalImages === 1, create post immediately (no session needed)
      if (totalImages === 1) {
        console.log(`[shortcut-upload] Single image mode - creating post immediately`);

        // Create a temporary session object for createPostFromSession
        const tempSession = {
          user_id: userId,
          session_id: sessionId,
          uploaded_files: [uploadResult],
          raw_text: rawText || null,
          collaborators: parsedCollaborators,
        };

        const result = await createPostFromSession(supabase, tempSession, lovableApiKey, userAgent);

        if (!result.success) {
          return new Response(
            JSON.stringify({ success: false, error: result.error }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            postId: result.postId,
            message: result.message,
            imagesUploaded: 1,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // CAROUSEL MODE: totalImages > 1, use session tracking
      // Check if session already exists (exact match only - no merging across sessions)
      const { data: existingSession } = await supabase
        .from("upload_sessions")
        .select("*")
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .eq("is_completed", false)
        .single();

      if (imageIndex === 0) {
        // First image: create new session or reset existing one
        if (existingSession) {
          const updatedFiles = [uploadResult];
          await supabase
            .from("upload_sessions")
            .update({
              uploaded_files: updatedFiles,
              raw_text: rawText || null,
              collaborators: parsedCollaborators,
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            })
            .eq("session_id", sessionId)
            .eq("user_id", userId);
          
          console.log(`[shortcut-upload] Session ${sessionId} reset with first image`);
        } else {
          await supabase.from("upload_sessions").insert({
            user_id: userId,
            session_id: sessionId,
            uploaded_files: [uploadResult],
            raw_text: rawText || null,
            collaborators: parsedCollaborators,
          });
          
          console.log(`[shortcut-upload] New session created: ${sessionId}`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            sessionId,
            imageIndex,
            totalImages,
            message: `Bild ${imageIndex + 1}/${totalImages} hochgeladen`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Subsequent images: append to session
        if (!existingSession) {
          console.error(`[shortcut-upload] No session found: ${sessionId}`);
          return new Response(
            JSON.stringify({ success: false, error: `Session ${sessionId} nicht gefunden` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const currentFiles = existingSession.uploaded_files as any[];
        const updatedFiles = [...currentFiles, uploadResult];

        await supabase
          .from("upload_sessions")
          .update({
            uploaded_files: updatedFiles,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          })
          .eq("session_id", sessionId)
          .eq("user_id", userId);

        console.log(`[shortcut-upload] Session ${sessionId} updated with image ${imageIndex + 1}`);

        // Check if this is the last image
        if (imageIndex === totalImages - 1) {
          console.log(`[shortcut-upload] Last image received, creating carousel post...`);

          const { data: finalSession } = await supabase
            .from("upload_sessions")
            .select("*")
            .eq("session_id", sessionId)
            .eq("user_id", userId)
            .single();

          if (!finalSession) {
            return new Response(
              JSON.stringify({ success: false, error: "Session nicht gefunden" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const result = await createPostFromSession(supabase, finalSession, lovableApiKey, userAgent);

          if (!result.success) {
            return new Response(
              JSON.stringify({ success: false, error: result.error }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          return new Response(
            JSON.stringify({
              success: true,
              postId: result.postId,
              message: result.message,
              imagesUploaded: totalImages,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            sessionId,
            imageIndex,
            totalImages,
            message: `Bild ${imageIndex + 1}/${totalImages} hochgeladen`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ========== LEGACY MODE: Single request with multiple files (max 3) ==========
    if (!files || !Array.isArray(files) || files.length === 0) {
      await logError(supabase, userId, "Keine Bilder hochgeladen", {
        source: "ios_shortcut",
        userAgent,
      });
      throw new Error("Keine Bilder hochgeladen");
    }

    // Limit to max 3 files in legacy mode
    const maxFiles = 3;
    
    if (files.length > maxFiles) {
      console.log(`[shortcut-upload] Too many files for legacy mode: ${files.length}, max allowed: ${maxFiles}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Für mehr als ${maxFiles} Bilder nutze bitte den Session-Modus (mit sessionId, imageIndex, totalImages).` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const filesToProcess = files;

    console.log(`[shortcut-upload] Legacy mode: Processing ${filesToProcess.length} files for user ${userId}`);

    // Step 1: Determine format
    const format = filesToProcess.length > 1 ? "carousel" : "single";
    console.log(`[shortcut-upload] Format detected: ${format}`);

    // Step 2: Upload files SEQUENTIALLY to reduce peak memory usage
    const uploadedFiles: { storagePath: string; publicUrl: string }[] = [];
    const uploadedUrls: string[] = [];
    const slides: any[] = [];

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const fileExt = "jpg"; // Always .jpg after compression
      const fileName = `${userId}/${crypto.randomUUID()}.${fileExt}`;

      console.log(`[shortcut-upload] Processing file ${i + 1}/${filesToProcess.length}...`);

      try {
        const result = await processAndUploadFile(
          supabase,
          userId,
          file.base64,
          fileName,
          file.type || "image/jpeg"
        );

        uploadedFiles.push(result);
        uploadedUrls.push(result.publicUrl);
        slides.push({
          index: i,
          image_url: result.publicUrl,
        });

        // Clear the base64 data from memory after processing
        file.base64 = null;

        console.log(`[shortcut-upload] Uploaded file ${i + 1}/${filesToProcess.length}`);
      } catch (uploadError) {
        console.error(`[shortcut-upload] Upload error for file ${i}:`, uploadError);
        await logError(supabase, userId, uploadError instanceof Error ? uploadError.message : "Upload-Fehler", {
          source: "ios_shortcut",
          fileIndex: i,
          filesTotal: filesToProcess.length,
          userAgent,
        });
        throw uploadError;
      }
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

    // Build message with image(s) - use URL instead of base64
    const userContent: any[] = [
      { type: "text", text: rawText ? `Rohtext: "${rawText}"` : "Erstelle eine passende Caption für dieses Bild." },
    ];

    // Add first image for vision analysis (using URL, not base64)
    userContent.push({
      type: "image_url",
      image_url: { url: uploadedUrls[0] },
    });

    if (filesToProcess.length > 1) {
      userContent[0].text += ` (Es handelt sich um ein Karussell mit ${filesToProcess.length} Bildern.)`;
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
        aiError: errorText.substring(0, 500),
        filesCount: filesToProcess.length,
      });
      throw new Error("AI-Generierung fehlgeschlagen");
    }

    const aiData = await aiResponse.json();
    const generatedCaption = (aiData.choices?.[0]?.message?.content ?? "").trim();

    if (!generatedCaption) {
      await logError(supabase, userId, "Keine Caption generiert", {
        source: "ios_shortcut",
        filesCount: filesToProcess.length,
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
        collaborators: parsedCollaborators,
      })
      .select("id")
      .single();

    if (parsedCollaborators.length > 0) {
      console.log(`[shortcut-upload] Collaborators added: ${parsedCollaborators.join(", ")}`);
    }

    if (postError) {
      console.error("[shortcut-upload] Post creation error:", postError);
      await logError(supabase, userId, `Post-Erstellung fehlgeschlagen: ${postError.message}`, {
        source: "ios_shortcut",
        filesCount: filesToProcess.length,
      });
      throw new Error(`Post konnte nicht erstellt werden: ${postError.message}`);
    }

    console.log(`[shortcut-upload] Post created: ${post.id}`);

    // Step 7: Link uploaded images to the post (planner reads assets(*))
    const { error: assetsError } = await supabase.from("assets").insert(
      uploadedFiles.map((f) => ({
        user_id: userId,
        post_id: post.id,
        storage_path: f.storagePath,
        public_url: f.publicUrl,
      })),
    );

    if (assetsError) {
      console.error("[shortcut-upload] Assets creation error:", assetsError);
      await logError(supabase, userId, `Assets-Erstellung fehlgeschlagen: ${assetsError.message}`, {
        source: "ios_shortcut",
        postId: post.id,
        filesCount: filesToProcess.length,
      });
    }

    // Step 8: Create slide assets for carousel (keeps order)
    if (format === "carousel") {
      for (let i = 0; i < uploadedFiles.length; i++) {
        await supabase.from("slide_assets").insert({
          user_id: userId,
          post_id: post.id,
          slide_index: i,
          public_url: uploadedFiles[i].publicUrl,
          storage_path: uploadedFiles[i].storagePath,
        });
      }
      console.log(`[shortcut-upload] Created ${uploadedFiles.length} slide assets`);
    }

    // Step 9: Log the successful action
    await supabase.from("logs").insert({
      user_id: userId,
      post_id: post.id,
      event_type: "shortcut_upload",
      level: "info",
      details: {
        format,
        files_count: filesToProcess.length,
        scheduled_for: scheduledAt.toISOString(),
        raw_text_provided: !!rawText,
        collaborators: parsedCollaborators,
        source: "ios_shortcut",
        userAgent,
        mode: "legacy",
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
        collaborators: parsedCollaborators,
        message: parsedCollaborators.length > 0 
          ? `📸 Collab-Post eingeplant für ${scheduledDay}, ${scheduledDateFormatted} um 18:00 Uhr (mit ${parsedCollaborators.join(", ")})`
          : `📸 Post eingeplant für ${scheduledDay}, ${scheduledDateFormatted} um 18:00 Uhr`,
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
