import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OAuthMode = "facebook_app" | "instagram_app";

function normalizeMode(raw: string | undefined | null): {
  raw: string;
  effective: OAuthMode;
} {
  const normalized = (raw ?? "").trim();
  if (normalized === "instagram_app") return { raw: normalized, effective: "instagram_app" };
  if (normalized === "facebook_app") return { raw: normalized, effective: "facebook_app" };
  return { raw: normalized || "(not set)", effective: "facebook_app" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const META_APP_ID = Deno.env.get("META_APP_ID");
    const { raw: modeRaw, effective: mode } = normalizeMode(Deno.env.get("META_OAUTH_MODE"));
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    if (!SUPABASE_URL) {
      return new Response(
        JSON.stringify({ error: "SUPABASE_URL not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build redirect URI
    const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/meta-oauth-callback`;

    // Require an authenticated user for BOTH debug + URL generation.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(SUPABASE_URL, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine scopes based on OAuth mode
    const authBaseUrl =
      mode === "instagram_app"
        ? "https://www.instagram.com/oauth/authorize"
        : "https://www.facebook.com/v20.0/dialog/oauth";

    const scopes =
      mode === "instagram_app"
        ? [
            // Instagram Login flow
            "instagram_business_basic",
            "instagram_business_content_publish",
            "instagram_business_manage_messages",
            "instagram_business_manage_comments",
          ]
        : [
            // Facebook Login for Business with Instagram Graph API
            "instagram_basic",
            "instagram_content_publish",
            "pages_show_list",
            "pages_read_engagement",
            "business_management",
          ];

    if (!META_APP_ID) {
      console.error("[meta-oauth-config] META_APP_ID not configured");
      return new Response(
        JSON.stringify({
          error: "META_APP_ID not configured",
          details: "Please set META_APP_ID in server secrets",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body (POST only) safely
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        try {
          body = (await req.json()) as Record<string, unknown>;
        } catch {
          body = {};
        }
      }
    }

    const isDebug = req.method === "GET" || body?.debug === true;

    const debugInfo = {
      meta_app_id: META_APP_ID,
      meta_oauth_mode: mode,
      meta_oauth_mode_raw: modeRaw,
      redirect_uri: REDIRECT_URI,
      scopes,
      auth_base_url: authBaseUrl,
      timestamp: new Date().toISOString(),
    };

    if (isDebug) {
      console.log("[meta-oauth-config] Debug info requested", {
        meta_oauth_mode: mode,
        meta_oauth_mode_raw: modeRaw,
      });
      return new Response(JSON.stringify(debugInfo), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build OAuth URL (state = user.id)
    const scopeParam = scopes.join(",");
    const authUrl =
      `${authBaseUrl}?client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(scopeParam)}` +
      `&state=${encodeURIComponent(user.id)}` +
      `&response_type=code`;

    console.log("[meta-oauth-config] Generated OAuth URL", {
      user_id: user.id,
      meta_oauth_mode: mode,
      meta_oauth_mode_raw: modeRaw,
      scopes,
    });

    return new Response(
      JSON.stringify({
        auth_url: authUrl,
        meta_app_id: META_APP_ID,
        meta_oauth_mode: mode,
        meta_oauth_mode_raw: modeRaw,
        scopes,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[meta-oauth-config] Error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
