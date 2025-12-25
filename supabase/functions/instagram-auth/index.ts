import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function maskToken(token: string): string {
  if (!token || token.length < 10) return "***";
  return token.substring(0, 6) + "..." + token.substring(token.length - 4);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code, redirect_uri } = await req.json();
    
    console.log("[instagram-auth] Received request");
    console.log("[instagram-auth] redirect_uri:", redirect_uri);
    console.log("[instagram-auth] code present:", !!code);

    if (!code) {
      return new Response(
        JSON.stringify({ success: false, error: "Kein Autorisierungscode erhalten" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!redirect_uri) {
      return new Response(
        JSON.stringify({ success: false, error: "Keine redirect_uri angegeben" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get environment variables
    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!META_APP_ID || !META_APP_SECRET) {
      console.error("[instagram-auth] Missing META_APP_ID or META_APP_SECRET");
      return new Response(
        JSON.stringify({ success: false, error: "Server-Konfiguration fehlt" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Nicht authentifiziert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("[instagram-auth] User auth error:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Benutzer nicht gefunden" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[instagram-auth] User ID:", user.id);

    // Exchange code for short-lived token
    console.log("[instagram-auth] Exchanging code for token...");
    const tokenUrl = "https://graph.facebook.com/v20.0/oauth/access_token";
    const tokenParams = new URLSearchParams({
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      redirect_uri: redirect_uri,
      code: code,
    });

    const tokenResponse = await fetch(`${tokenUrl}?${tokenParams}`);
    const tokenResponseText = await tokenResponse.text();
    console.log("[instagram-auth] Token response status:", tokenResponse.status);
    
    let tokenData;
    try {
      tokenData = JSON.parse(tokenResponseText);
    } catch {
      console.error("[instagram-auth] Failed to parse token response:", tokenResponseText);
      return new Response(
        JSON.stringify({ success: false, error: "Ungültige Token-Antwort", details: tokenResponseText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (tokenData.error) {
      console.error("[instagram-auth] Token error:", tokenData.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: tokenData.error.message || "Token-Fehler",
          error_code: tokenData.error.code,
          error_type: tokenData.error.type
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const shortLivedToken = tokenData.access_token;
    console.log("[instagram-auth] Got short-lived token:", maskToken(shortLivedToken));

    // Exchange for long-lived token
    console.log("[instagram-auth] Exchanging for long-lived token...");
    const longLivedParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: shortLivedToken,
    });

    const longLivedResponse = await fetch(`${tokenUrl}?${longLivedParams}`);
    const longLivedText = await longLivedResponse.text();
    console.log("[instagram-auth] Long-lived response status:", longLivedResponse.status);

    let longLivedData;
    try {
      longLivedData = JSON.parse(longLivedText);
    } catch {
      console.error("[instagram-auth] Failed to parse long-lived response:", longLivedText);
      return new Response(
        JSON.stringify({ success: false, error: "Ungültige Long-Lived Token-Antwort" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (longLivedData.error) {
      console.error("[instagram-auth] Long-lived token error:", longLivedData.error);
      return new Response(
        JSON.stringify({ success: false, error: "Long-Lived Token Fehler", details: longLivedData.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // Default 60 days
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    console.log("[instagram-auth] Got long-lived token:", maskToken(accessToken));
    console.log("[instagram-auth] Expires at:", expiresAt);

    // Get user's pages
    console.log("[instagram-auth] Getting user pages...");
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error("[instagram-auth] Pages error:", pagesData.error);
      return new Response(
        JSON.stringify({ success: false, error: "Fehler beim Abrufen der Seiten", details: pagesData.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      console.error("[instagram-auth] No pages found");
      return new Response(
        JSON.stringify({ success: false, error: "Keine Facebook-Seiten gefunden. Bitte erstellen Sie eine Seite und verknüpfen Sie sie mit Ihrem Instagram-Konto." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the first page
    const page = pagesData.data[0];
    const pageId = page.id;
    const pageName = page.name;
    const pageAccessToken = page.access_token;

    console.log("[instagram-auth] Using page:", pageName, "(", pageId, ")");

    // Get Instagram Business Account linked to the page
    console.log("[instagram-auth] Getting Instagram account...");
    const igResponse = await fetch(
      `https://graph.facebook.com/v20.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
    );
    const igData = await igResponse.json();

    if (igData.error) {
      console.error("[instagram-auth] IG account error:", igData.error);
      return new Response(
        JSON.stringify({ success: false, error: "Fehler beim Abrufen des Instagram-Kontos", details: igData.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!igData.instagram_business_account?.id) {
      console.error("[instagram-auth] No IG account linked to page");
      return new Response(
        JSON.stringify({ success: false, error: "Kein Instagram Business-Konto mit dieser Seite verknüpft. Bitte verbinden Sie Ihr Instagram-Konto mit Ihrer Facebook-Seite." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const igUserId = igData.instagram_business_account.id;

    // Get Instagram username
    console.log("[instagram-auth] Getting Instagram username...");
    const igUserResponse = await fetch(
      `https://graph.facebook.com/v20.0/${igUserId}?fields=username&access_token=${pageAccessToken}`
    );
    const igUserData = await igUserResponse.json();
    const igUsername = igUserData.username || "unknown";

    console.log("[instagram-auth] Instagram username:", igUsername);

    // Save to meta_connections table
    console.log("[instagram-auth] Saving connection...");
    const { error: upsertError } = await supabase
      .from("meta_connections")
      .upsert({
        user_id: user.id,
        page_id: pageId,
        page_name: pageName,
        ig_user_id: igUserId,
        ig_username: igUsername,
        token_encrypted: pageAccessToken, // Using page token for Graph API calls
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("[instagram-auth] Database error:", upsertError);
      return new Response(
        JSON.stringify({ success: false, error: "Fehler beim Speichern der Verbindung", details: upsertError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the connection
    await supabase.from("logs").insert({
      user_id: user.id,
      event_type: "instagram_connected",
      level: "info",
      details: { ig_username: igUsername, page_name: pageName },
    });

    console.log("[instagram-auth] Connection saved successfully!");

    return new Response(
      JSON.stringify({ 
        success: true, 
        ig_username: igUsername,
        page_name: pageName,
        expires_at: expiresAt
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[instagram-auth] Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
