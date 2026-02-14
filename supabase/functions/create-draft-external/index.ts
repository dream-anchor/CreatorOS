import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-external-api-key",
};

// External API for creating post drafts from other systems (e.g. Troups)
// Accepts event data and creates a post draft with status IDEA
interface ExternalDraftRequest {
  venue_name: string;
  city: string;
  event_date: string; // ISO date string
  ticket_url?: string;
  ticket_info?: string;
  ticket_type?: string;
  venue_url?: string;
  source_system: string; // e.g. "troups"
  source_event_id?: string; // ID in the source system
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: check external API key
    const externalApiKey = req.headers.get("x-external-api-key");
    const expectedKey = Deno.env.get("EXTERNAL_API_KEY");

    if (!expectedKey || externalApiKey !== expectedKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: invalid or missing API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json()) as ExternalDraftRequest;

    if (!body.venue_name || !body.city || !body.event_date) {
      return new Response(
        JSON.stringify({ error: "venue_name, city, and event_date are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Format event date for display
    const eventDate = new Date(body.event_date);
    const dateStr = eventDate.toLocaleDateString("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Build caption draft
    const ticketLine = body.ticket_url
      ? `\n\nTickets: ${body.ticket_url}`
      : body.ticket_info
        ? `\n\n${body.ticket_info}`
        : "";

    const caption = `Pater Brown - Das Live-Hörspiel\n${dateStr}\n${body.venue_name}, ${body.city}${ticketLine}`;

    const hashtags = [
      "#paterbrown",
      "#livehörspiel",
      "#theater",
      `#${body.city.toLowerCase().replace(/[^a-zäöüß]/g, "")}`,
      "#tournee",
      "#krimi",
    ].join(" ");

    // Get the default user (owner) for this CreatorOS instance
    const { data: ownerRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "owner")
      .limit(1)
      .single();

    if (!ownerRole) {
      return new Response(
        JSON.stringify({ error: "No owner user found in CreatorOS" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the post draft
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        user_id: ownerRole.user_id,
        status: "IDEA",
        caption,
        hashtags,
        format: "single",
        alt_text: `Pater Brown Live-Hörspiel am ${dateStr} in ${body.venue_name}, ${body.city}`,
        category: "announcements",
        mood: "informativ",
        topic_tags: ["tour", "termin", body.city.toLowerCase()],
      })
      .select("id, status, caption, created_at")
      .single();

    if (postError) {
      console.error("[CreateDraftExternal] Insert error:", postError);
      return new Response(
        JSON.stringify({ error: `Failed to create draft: ${postError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the creation
    await supabase.from("logs").insert({
      user_id: ownerRole.user_id,
      post_id: post.id,
      level: "INFO",
      event_type: "external_draft_created",
      details: {
        source_system: body.source_system,
        source_event_id: body.source_event_id,
        venue_name: body.venue_name,
        city: body.city,
        event_date: body.event_date,
      },
    });

    console.log(`[CreateDraftExternal] Created draft ${post.id} for ${body.venue_name} in ${body.city}`);

    return new Response(
      JSON.stringify({
        success: true,
        post_id: post.id,
        status: post.status,
        caption_preview: post.caption?.substring(0, 100),
        created_at: post.created_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CreateDraftExternal] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
