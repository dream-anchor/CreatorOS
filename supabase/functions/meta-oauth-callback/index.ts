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
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // Contains user_id
    const error = url.searchParams.get("error");

    if (error) {
      console.error("[meta-oauth-callback] OAuth error:", error);
      return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?error=${error}`);
    }

    if (!code || !state) {
      return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?error=missing_params`);
    }

    const META_APP_ID = Deno.env.get("META_APP_ID");
    const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
    const REDIRECT_URI = Deno.env.get("META_REDIRECT_URI") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-oauth-callback`;

    if (!META_APP_ID || !META_APP_SECRET) {
      console.error("[meta-oauth-callback] Missing META_APP_ID or META_APP_SECRET");
      return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?error=config_error`);
    }

    // Exchange code for short-lived token
    console.log("[meta-oauth-callback] Exchanging code for token...");
    const tokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token`;
    const tokenParams = new URLSearchParams({
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      redirect_uri: REDIRECT_URI,
      code: code,
    });

    const tokenResponse = await fetch(`${tokenUrl}?${tokenParams}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("[meta-oauth-callback] Token error:", tokenData.error);
      return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?error=token_error`);
    }

    const shortLivedToken = tokenData.access_token;

    // Exchange for long-lived token
    console.log("[meta-oauth-callback] Exchanging for long-lived token...");
    const longLivedUrl = `https://graph.facebook.com/v20.0/oauth/access_token`;
    const longLivedParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      fb_exchange_token: shortLivedToken,
    });

    const longLivedResponse = await fetch(`${longLivedUrl}?${longLivedParams}`);
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      console.error("[meta-oauth-callback] Long-lived token error:", longLivedData.error);
      return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?error=token_exchange_error`);
    }

    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // Default 60 days
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Get user's pages
    console.log("[meta-oauth-callback] Getting user pages...");
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v20.0/me/accounts?access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    if (pagesData.error || !pagesData.data?.length) {
      console.error("[meta-oauth-callback] No pages found:", pagesData.error);
      return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?error=no_pages`);
    }

    // Use the first page (in production, let user select)
    const page = pagesData.data[0];
    const pageId = page.id;
    const pageName = page.name;
    const pageAccessToken = page.access_token;

    // Get Instagram Business Account linked to the page
    console.log("[meta-oauth-callback] Getting Instagram account...");
    const igResponse = await fetch(
      `https://graph.facebook.com/v20.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
    );
    const igData = await igResponse.json();

    if (igData.error || !igData.instagram_business_account?.id) {
      console.error("[meta-oauth-callback] No IG account linked:", igData);
      return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?error=no_instagram`);
    }

    const igUserId = igData.instagram_business_account.id;

    // Get IG username
    const igUserResponse = await fetch(
      `https://graph.facebook.com/v20.0/${igUserId}?fields=username&access_token=${pageAccessToken}`
    );
    const igUserData = await igUserResponse.json();
    const igUsername = igUserData.username || null;

    // Save to database
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userId = state;

    // Upsert connection
    const { error: upsertError } = await supabase
      .from("meta_connections")
      .upsert({
        user_id: userId,
        page_id: pageId,
        page_name: pageName,
        ig_user_id: igUserId,
        ig_username: igUsername,
        token_encrypted: pageAccessToken, // In production, encrypt this!
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "user_id",
      });

    if (upsertError) {
      console.error("[meta-oauth-callback] Save error:", upsertError);
      return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?error=save_error`);
    }

    // Log success
    await supabase.from("logs").insert({
      user_id: userId,
      event_type: "meta.connected",
      level: "info",
      details: { page_id: pageId, ig_user_id: igUserId, ig_username: igUsername },
    });

    console.log("[meta-oauth-callback] Successfully connected:", igUsername);

    return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?success=true`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[meta-oauth-callback] Error:", errorMessage);
    return Response.redirect(`${Deno.env.get("SITE_URL") || ""}/settings/meta?error=unknown`);
  }
});
