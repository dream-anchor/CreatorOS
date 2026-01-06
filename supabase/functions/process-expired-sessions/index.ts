import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  
  let checkDate = new Date(now);
  if (currentHour >= 18) {
    checkDate.setDate(checkDate.getDate() + 1);
  }
  
  checkDate.setHours(0, 0, 0, 0);
  
  for (let i = 0; i < 30; i++) {
    const startOfDay = new Date(checkDate);
    const endOfDay = new Date(checkDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const { data: existingPosts, error } = await supabase
      .from("posts")
      .select("id")
      .eq("user_id", userId)
      .gte("scheduled_at", startOfDay.toISOString())
      .lte("scheduled_at", endOfDay.toISOString())
      .limit(1);
    
    if (error) {
      checkDate.setDate(checkDate.getDate() + 1);
      continue;
    }
    
    if (!existingPosts || existingPosts.length === 0) {
      const scheduledDate = new Date(checkDate);
      scheduledDate.setHours(18, 0, 0, 0);
      return scheduledDate;
    }
    
    checkDate.setDate(checkDate.getDate() + 1);
  }
  
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 30);
  fallback.setHours(18, 0, 0, 0);
  return fallback;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("[process-expired-sessions] Starting expired session check...");

  try {
    const now = new Date().toISOString();

    // Find all expired, incomplete sessions that have uploaded files
    const { data: expiredSessions, error: fetchError } = await supabase
      .from("upload_sessions")
      .select("*")
      .eq("is_completed", false)
      .lt("expires_at", now)
      .not("uploaded_files", "eq", "[]");

    if (fetchError) {
      console.error("[process-expired-sessions] Error fetching sessions:", fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!expiredSessions || expiredSessions.length === 0) {
      console.log("[process-expired-sessions] No expired sessions to process");
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "Keine abgelaufenen Sessions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[process-expired-sessions] Found ${expiredSessions.length} expired sessions`);

    let processed = 0;
    let errors = 0;
    const results: any[] = [];

    for (const session of expiredSessions) {
      const uploadedFiles = session.uploaded_files as any[];
      
      if (!uploadedFiles || uploadedFiles.length === 0) {
        console.log(`[process-expired-sessions] Session ${session.session_id} has no files, marking as completed`);
        await supabase
          .from("upload_sessions")
          .update({ is_completed: true })
          .eq("id", session.id);
        continue;
      }

      console.log(`[process-expired-sessions] Processing session ${session.session_id} with ${uploadedFiles.length} files`);

      try {
        const userId = session.user_id;
        const rawText = session.raw_text;
        const parsedCollaborators = session.collaborators || [];

        // Determine format
        const format = uploadedFiles.length > 1 ? "carousel" : "single";
        const uploadedUrls = uploadedFiles.map((f: any) => f.publicUrl);

        // Build slides
        const slides = uploadedFiles.map((f: any, i: number) => ({
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

        // Generate caption using AI Vision
        console.log(`[process-expired-sessions] Generating caption for session ${session.session_id}...`);

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

        const userContent: any[] = [
          { type: "text", text: rawText ? `Rohtext: "${rawText}"` : "Erstelle eine passende Caption für dieses Bild." },
          { type: "image_url", image_url: { url: uploadedUrls[0] } },
        ];

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
          console.error(`[process-expired-sessions] AI error for session ${session.session_id}:`, errorText);
          errors++;
          results.push({ sessionId: session.session_id, error: "AI-Generierung fehlgeschlagen" });
          continue;
        }

        const aiData = await aiResponse.json();
        const generatedCaption = (aiData.choices?.[0]?.message?.content ?? "").trim();

        if (!generatedCaption) {
          console.error(`[process-expired-sessions] No caption generated for session ${session.session_id}`);
          errors++;
          results.push({ sessionId: session.session_id, error: "Keine Caption generiert" });
          continue;
        }

        // Find next free slot
        const scheduledAt = await findNextFreeSlot(supabase, userId);
        const scheduledDay = getDayName(scheduledAt);
        const scheduledDateFormatted = formatDate(scheduledAt);

        console.log(`[process-expired-sessions] Scheduling for: ${scheduledDay}, ${scheduledDateFormatted}`);

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
          console.error(`[process-expired-sessions] Post creation error for session ${session.session_id}:`, postError);
          errors++;
          results.push({ sessionId: session.session_id, error: postError.message });
          continue;
        }

        // Link uploaded images to the post
        await supabase.from("assets").insert(
          uploadedFiles.map((f: any) => ({
            user_id: userId,
            post_id: post.id,
            storage_path: f.storagePath,
            public_url: f.publicUrl,
          })),
        );

        // Create slide assets for carousel
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
        }

        // Mark session as completed
        await supabase
          .from("upload_sessions")
          .update({ is_completed: true })
          .eq("id", session.id);

        // Log the successful action
        await supabase.from("logs").insert({
          user_id: userId,
          post_id: post.id,
          event_type: "expired_session_processed",
          level: "info",
          details: {
            session_id: session.session_id,
            format,
            files_count: uploadedFiles.length,
            scheduled_for: scheduledAt.toISOString(),
            source: "process-expired-sessions",
          },
        });

        processed++;
        results.push({
          sessionId: session.session_id,
          postId: post.id,
          scheduledFor: `${scheduledDay}, ${scheduledDateFormatted}`,
          filesCount: uploadedFiles.length,
        });

        console.log(`[process-expired-sessions] Created post ${post.id} from session ${session.session_id}`);
      } catch (sessionError) {
        console.error(`[process-expired-sessions] Error processing session ${session.session_id}:`, sessionError);
        errors++;
        results.push({ sessionId: session.session_id, error: String(sessionError) });
      }
    }

    console.log(`[process-expired-sessions] Completed: ${processed} processed, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        errors,
        total: expiredSessions.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[process-expired-sessions] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
