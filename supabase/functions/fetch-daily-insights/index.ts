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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if this is a manual call (with auth) or cron call
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader) {
      const { data: authData } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", "")
      );
      userId = authData?.user?.id || null;
    }

    // Get body for specific user (cron mode)
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body, use auth user
    }

    if (body.user_id) {
      userId = body.user_id;
    }

    // If still no user, fetch all users with meta connections (cron mode)
    if (!userId) {
      console.log("[fetch-daily-insights] Cron mode: fetching for all connected users");
      
      const { data: connections } = await supabase
        .from("meta_connections")
        .select("user_id, ig_user_id, token_encrypted")
        .not("token_encrypted", "is", null);

      if (!connections || connections.length === 0) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: "No connected users found",
          tracked: 0 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const results = [];
      for (const conn of connections) {
        try {
          const result = await fetchInsightsForUser(supabase, conn.user_id, conn.ig_user_id, conn.token_encrypted);
          results.push({ user_id: conn.user_id, ...result });
        } catch (err) {
          console.error(`[fetch-daily-insights] Error for user ${conn.user_id}:`, err);
          results.push({ user_id: conn.user_id, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }

      return new Response(JSON.stringify({
        success: true,
        tracked: results.filter(r => !r.error).length,
        errors: results.filter(r => r.error).length,
        results
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single user mode (manual trigger)
    console.log(`[fetch-daily-insights] Manual mode for user: ${userId}`);

    // Get user's meta connection
    const { data: connection, error: connError } = await supabase
      .from("meta_connections")
      .select("ig_user_id, token_encrypted")
      .eq("user_id", userId)
      .maybeSingle();

    if (connError || !connection?.token_encrypted) {
      return new Response(JSON.stringify({ 
        error: "Keine Instagram-Verbindung gefunden" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await fetchInsightsForUser(supabase, userId, connection.ig_user_id, connection.token_encrypted);

    return new Response(JSON.stringify({
      success: true,
      ...result
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[fetch-daily-insights] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function fetchInsightsForUser(
  supabase: any, 
  userId: string, 
  igUserId: string, 
  accessToken: string
): Promise<any> {
  const today = new Date().toISOString().split("T")[0];
  
  console.log(`[fetch-daily-insights] Fetching insights for ${igUserId} on ${today}`);

  // 1. Fetch basic account info (followers_count)
  const accountUrl = `https://graph.instagram.com/v22.0/${igUserId}?fields=followers_count,media_count&access_token=${accessToken}`;
  const accountRes = await fetch(accountUrl);
  
  if (!accountRes.ok) {
    const errorData = await accountRes.json();
    console.error("[fetch-daily-insights] Account API error:", errorData);
    throw new Error(`Instagram API error: ${errorData.error?.message || "Unknown"}`);
  }

  const accountData = await accountRes.json();
  console.log("[fetch-daily-insights] Account data:", accountData);

  // 2. Fetch insights (impressions, reach, profile_views)
  // Note: These metrics require a Business/Creator account
  let insightsData: any = {};
  
  try {
    // Fetch lifetime metrics that are available
    const insightsUrl = `https://graph.instagram.com/v22.0/${igUserId}/insights?metric=impressions,reach,profile_views,website_clicks,email_contacts&period=day&access_token=${accessToken}`;
    const insightsRes = await fetch(insightsUrl);
    
    if (insightsRes.ok) {
      const rawInsights = await insightsRes.json();
      console.log("[fetch-daily-insights] Raw insights:", JSON.stringify(rawInsights));
      
      // Parse insights response
      if (rawInsights.data) {
        for (const metric of rawInsights.data) {
          const metricName = metric.name;
          // Get the most recent value
          const value = metric.values?.[0]?.value || 0;
          insightsData[metricName] = value;
        }
      }
    } else {
      const insightsError = await insightsRes.json();
      console.warn("[fetch-daily-insights] Insights API error (non-fatal):", insightsError);
      // Continue without insights - not all accounts have access
    }
  } catch (insightsErr) {
    console.warn("[fetch-daily-insights] Insights fetch failed (non-fatal):", insightsErr);
  }

  // 3. Count today's posts and stories
  let postsToday = 0;
  try {
    const { count } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "PUBLISHED")
      .gte("published_at", `${today}T00:00:00`)
      .lte("published_at", `${today}T23:59:59`);
    
    postsToday = count || 0;
  } catch {
    // Ignore
  }

  // 4. Prepare stats object
  const stats = {
    user_id: userId,
    date: today,
    follower_count: accountData.followers_count || 0,
    impressions_day: insightsData.impressions || 0,
    reach_day: insightsData.reach || 0,
    profile_views: insightsData.profile_views || 0,
    website_clicks: insightsData.website_clicks || 0,
    email_contacts: insightsData.email_contacts || 0,
    posts_count: postsToday,
    stories_count: 0, // Stories API requires different endpoint
  };

  console.log("[fetch-daily-insights] Saving stats:", stats);

  // 5. Upsert into daily_account_stats
  const { error: upsertError } = await supabase
    .from("daily_account_stats")
    .upsert(stats, { 
      onConflict: "user_id,date",
      ignoreDuplicates: false 
    });

  if (upsertError) {
    console.error("[fetch-daily-insights] Upsert error:", upsertError);
    throw new Error(`Database error: ${upsertError.message}`);
  }

  // 6. Log the event
  await supabase.from("logs").insert({
    user_id: userId,
    event_type: "DAILY_INSIGHTS_TRACKED",
    level: "info",
    details: {
      date: today,
      follower_count: stats.follower_count,
      impressions: stats.impressions_day,
      reach: stats.reach_day
    }
  });

  return {
    date: today,
    stats: {
      followers: stats.follower_count,
      impressions: stats.impressions_day,
      reach: stats.reach_day,
      profile_views: stats.profile_views,
      website_clicks: stats.website_clicks
    }
  };
}
