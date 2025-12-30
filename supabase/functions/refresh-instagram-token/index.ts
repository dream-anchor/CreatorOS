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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[refresh-instagram-token] Starting token refresh check...");

    // Find tokens that expire within the next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const { data: connections, error: fetchError } = await supabase
      .from("meta_connections")
      .select("id, user_id, token_encrypted, token_expires_at, ig_username")
      .not("token_encrypted", "is", null)
      .lte("token_expires_at", sevenDaysFromNow.toISOString());

    if (fetchError) {
      console.error("[refresh-instagram-token] Error fetching connections:", fetchError);
      throw fetchError;
    }

    if (!connections || connections.length === 0) {
      console.log("[refresh-instagram-token] No tokens need refreshing");
      return new Response(
        JSON.stringify({ success: true, message: "No tokens need refreshing", refreshed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[refresh-instagram-token] Found ${connections.length} token(s) to refresh`);

    let refreshedCount = 0;
    let failedCount = 0;
    const results: Array<{ user_id: string; ig_username: string | null; success: boolean; error?: string }> = [];

    for (const connection of connections) {
      try {
        console.log(`[refresh-instagram-token] Refreshing token for @${connection.ig_username || connection.user_id}`);

        // Refresh the long-lived token
        // Facebook/Instagram long-lived tokens can be refreshed if they haven't expired yet
        const refreshUrl = `https://graph.instagram.com/refresh_access_token`;
        const refreshParams = new URLSearchParams({
          grant_type: "ig_refresh_token",
          access_token: connection.token_encrypted,
        });

        const refreshResponse = await fetch(`${refreshUrl}?${refreshParams}`);
        const refreshData = await refreshResponse.json();

        if (refreshData.error) {
          console.error(`[refresh-instagram-token] Refresh failed for @${connection.ig_username}:`, refreshData.error);
          
          // Log the failure
          await supabase.from("logs").insert({
            user_id: connection.user_id,
            event_type: "token_refresh_failed",
            level: "error",
            details: {
              ig_username: connection.ig_username,
              error: refreshData.error.message,
              error_code: refreshData.error.code,
            },
          });

          results.push({
            user_id: connection.user_id,
            ig_username: connection.ig_username,
            success: false,
            error: refreshData.error.message,
          });
          failedCount++;
          continue;
        }

        // Calculate new expiration date
        const newExpiresIn = refreshData.expires_in || 5184000; // Default 60 days
        const newExpiresAt = new Date(Date.now() + newExpiresIn * 1000).toISOString();

        // Update the token in database
        const { error: updateError } = await supabase
          .from("meta_connections")
          .update({
            token_encrypted: refreshData.access_token,
            token_expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", connection.id);

        if (updateError) {
          console.error(`[refresh-instagram-token] Database update failed for @${connection.ig_username}:`, updateError);
          results.push({
            user_id: connection.user_id,
            ig_username: connection.ig_username,
            success: false,
            error: "Database update failed",
          });
          failedCount++;
          continue;
        }

        // Log success
        await supabase.from("logs").insert({
          user_id: connection.user_id,
          event_type: "token_refresh_success",
          level: "info",
          details: {
            ig_username: connection.ig_username,
            new_expires_at: newExpiresAt,
            expires_in_days: Math.round(newExpiresIn / 86400),
          },
        });

        console.log(`[refresh-instagram-token] Successfully refreshed token for @${connection.ig_username}, expires: ${newExpiresAt}`);
        results.push({
          user_id: connection.user_id,
          ig_username: connection.ig_username,
          success: true,
        });
        refreshedCount++;

      } catch (tokenError) {
        console.error(`[refresh-instagram-token] Unexpected error for @${connection.ig_username}:`, tokenError);
        results.push({
          user_id: connection.user_id,
          ig_username: connection.ig_username,
          success: false,
          error: tokenError instanceof Error ? tokenError.message : "Unknown error",
        });
        failedCount++;
      }
    }

    console.log(`[refresh-instagram-token] Completed: ${refreshedCount} refreshed, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        refreshed: refreshedCount,
        failed: failedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[refresh-instagram-token] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
