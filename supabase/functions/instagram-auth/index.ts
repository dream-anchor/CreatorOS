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

interface InstagramAccount {
  ig_user_id: string;
  ig_username: string;
  profile_picture_url?: string;
  page_id: string;
  page_name: string;
  page_access_token: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { code, redirect_uri, action, selected_account } = body;
    
    console.log("[instagram-auth] Received request, action:", action || "exchange_code");

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

    // Handle action: select_account - save selected account
    if (action === "select_account" && selected_account) {
      console.log("[instagram-auth] Selecting account:", selected_account.ig_username);
      
      const { error: upsertError } = await supabase
        .from("meta_connections")
        .upsert({
          user_id: user.id,
          page_id: selected_account.page_id,
          page_name: selected_account.page_name,
          ig_user_id: selected_account.ig_user_id,
          ig_username: selected_account.ig_username,
          token_encrypted: selected_account.page_access_token,
          token_expires_at: selected_account.token_expires_at,
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
        details: { ig_username: selected_account.ig_username, page_name: selected_account.page_name },
      });

      console.log("[instagram-auth] Account selected and saved successfully!");
      return new Response(
        JSON.stringify({ 
          success: true, 
          ig_username: selected_account.ig_username,
          page_name: selected_account.page_name
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default action: exchange code for tokens and return all accounts
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

    console.log("[instagram-auth] redirect_uri:", redirect_uri);

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

    const userAccessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // Default 60 days
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    console.log("[instagram-auth] Got long-lived user token:", maskToken(userAccessToken));
    console.log("[instagram-auth] Expires at:", expiresAt);

    // Get user's pages
    console.log("[instagram-auth] Getting user pages...");
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?access_token=${userAccessToken}`
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

    console.log("[instagram-auth] Found", pagesData.data.length, "pages");

    // Collect all Instagram accounts from all pages
    const instagramAccounts: InstagramAccount[] = [];

    for (const page of pagesData.data) {
      const pageId = page.id;
      const pageName = page.name;
      const pageAccessToken = page.access_token;

      console.log("[instagram-auth] Checking page:", pageName, "(", pageId, ")");

      // Get Instagram Business Account linked to the page
      const igResponse = await fetch(
        `https://graph.facebook.com/v20.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
      );
      const igData = await igResponse.json();

      if (igData.error) {
        console.log("[instagram-auth] Page", pageName, "- IG error:", igData.error.message);
        continue;
      }

      if (!igData.instagram_business_account?.id) {
        console.log("[instagram-auth] Page", pageName, "- No IG account linked");
        continue;
      }

      const igUserId = igData.instagram_business_account.id;

      // Get Instagram username and profile picture
      const igUserResponse = await fetch(
        `https://graph.facebook.com/v20.0/${igUserId}?fields=username,profile_picture_url&access_token=${pageAccessToken}`
      );
      const igUserData = await igUserResponse.json();
      const igUsername = igUserData.username || "unknown";
      const profilePictureUrl = igUserData.profile_picture_url || null;

      console.log("[instagram-auth] Found IG account:", igUsername, "on page", pageName);

      instagramAccounts.push({
        ig_user_id: igUserId,
        ig_username: igUsername,
        profile_picture_url: profilePictureUrl,
        page_id: pageId,
        page_name: pageName,
        page_access_token: pageAccessToken,
      });
    }

    if (instagramAccounts.length === 0) {
      console.error("[instagram-auth] No Instagram accounts found on any page");
      return new Response(
        JSON.stringify({ success: false, error: "Kein Instagram Business-Konto mit einer Facebook-Seite verknüpft. Bitte verbinden Sie Ihr Instagram-Konto mit Ihrer Facebook-Seite." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[instagram-auth] Found", instagramAccounts.length, "Instagram accounts total");

    // Return all accounts for user selection
    return new Response(
      JSON.stringify({ 
        success: true,
        action: "select_account",
        accounts: instagramAccounts,
        token_expires_at: expiresAt
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