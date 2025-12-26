import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate virality score for a post
function calculateViralityScore(likes: number, comments: number, saved: number = 0): number {
  // Score = Likes*1 + Comments*3 + Saved*2
  return likes + (comments * 3) + (saved * 2);
}

// Calculate engagement rate: (likes + comments + saves) / reach * 100
function calculateEngagementRate(likes: number, comments: number, saved: number, reach: number): number {
  if (reach <= 0) return 0;
  return Math.round(((likes + comments + saved) / reach) * 10000) / 100; // 2 decimal places
}

// Get performance label based on metrics
function getPerformanceLabel(likes: number, comments: number, saved: number): string {
  const commentRatio = likes > 0 ? comments / likes : 0;
  const saveRatio = likes > 0 ? saved / likes : 0;
  
  if (commentRatio > 0.15) return 'discussion_starter';
  if (saveRatio > 0.1) return 'high_value';
  if (likes > 500) return 'viral_hit';
  return 'high_engagement';
}

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

interface MediaInsights {
  saved?: number;
  reach?: number;
  impressions?: number;
  plays?: number; // For reels
}

interface PaginatedResponse {
  data: InstagramMedia[];
  paging?: {
    cursors?: { after?: string };
    next?: string;
  };
}

// Fetch insights for a single media item
async function fetchMediaInsights(mediaId: string, accessToken: string, mediaType: string): Promise<MediaInsights> {
  try {
    // Different metrics for different media types
    // Images/Carousels: impressions, reach, saved
    // Reels: plays, reach, saved
    const isReel = mediaType === 'VIDEO' || mediaType === 'REELS';
    const metrics = isReel 
      ? 'plays,reach,saved' 
      : 'impressions,reach,saved';
    
    const url = `https://graph.facebook.com/v17.0/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      // Insights might not be available for all posts (e.g., older posts)
      console.log(`Insights not available for ${mediaId}: ${response.status}`);
      return {};
    }
    
    const data = await response.json();
    const insights: MediaInsights = {};
    
    if (data.data) {
      for (const metric of data.data) {
        const value = metric.values?.[0]?.value || 0;
        switch (metric.name) {
          case 'saved':
            insights.saved = value;
            break;
          case 'reach':
            insights.reach = value;
            break;
          case 'impressions':
            insights.impressions = value;
            break;
          case 'plays':
            insights.plays = value;
            // For reels, use plays as impressions equivalent
            insights.impressions = value;
            break;
        }
      }
    }
    
    return insights;
  } catch (error) {
    console.error(`Error fetching insights for ${mediaId}:`, error);
    return {};
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    // Parse request body for mode
    let mode = 'full'; // Default: full import
    try {
      const body = await req.json();
      if (body?.mode === 'sync_recent') {
        mode = 'sync_recent';
      } else if (body?.mode === 'force_resync') {
        mode = 'force_resync';
      }
    } catch {
      // No body or invalid JSON - use default mode
    }

    // For sync_recent mode, check if auto_sync is enabled
    if (mode === 'sync_recent') {
      const { data: settings } = await supabase
        .from('settings')
        .select('auto_sync_enabled')
        .eq('user_id', user.id)
        .maybeSingle();

      if (settings?.auto_sync_enabled === false) {
        console.log('Auto sync disabled by user - skipping');
        return new Response(JSON.stringify({ 
          success: true, 
          synced: 0,
          message: 'Auto-Sync ist deaktiviert'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Get user's Meta connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connError || !connection?.token_encrypted) {
      // For sync_recent, silently return if not connected
      if (mode === 'sync_recent') {
        return new Response(JSON.stringify({ 
          success: true, 
          synced: 0,
          message: 'Instagram nicht verbunden - Sync übersprungen'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('Instagram nicht verbunden. Bitte zuerst verbinden.');
    }

    const accessToken = connection.token_encrypted;
    const igUserId = connection.ig_user_id;

    if (!igUserId) {
      if (mode === 'sync_recent') {
        return new Response(JSON.stringify({ 
          success: true, 
          synced: 0,
          message: 'IG User ID nicht gefunden - Sync übersprungen'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('Instagram User ID nicht gefunden');
    }

    // Mode-specific settings
    const MAX_POSTS = mode === 'force_resync' ? 20 : (mode === 'sync_recent' ? 50 : 1000);
    const BATCH_SIZE = mode === 'force_resync' ? 20 : (mode === 'sync_recent' ? 50 : 50);
    const logPrefix = mode === 'force_resync' ? 'Force Resync' : (mode === 'sync_recent' ? 'Smart Sync' : 'Deep Import');

    console.log(`${logPrefix} starting for user ${user.id}, IG user ${igUserId}, mode: ${mode}`);

    let allMedia: InstagramMedia[] = [];
    let pageCount = 0;

    // Initial request
    const baseUrl = `https://graph.facebook.com/v17.0/${igUserId}/media`;
    const fields = 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count';
    let currentUrl = `${baseUrl}?fields=${fields}&limit=${BATCH_SIZE}&access_token=${accessToken}`;

    // Pagination loop (for sync_recent, only 1 page)
    while (currentUrl && allMedia.length < MAX_POSTS) {
      pageCount++;
      console.log(`${logPrefix}: Fetching page ${pageCount}, current total: ${allMedia.length}`);

      const response = await fetch(currentUrl);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Instagram API error:', errorData);
        
        const errorCode = errorData.error?.code || response.status;
        const errorMessage = errorData.error?.message || 'Unbekannter API-Fehler';
        const errorType = errorData.error?.type || 'UnknownError';
        
        // For sync_recent and force_resync, return detailed error
        if (mode === 'sync_recent' || mode === 'force_resync') {
          return new Response(JSON.stringify({ 
            success: false, 
            synced: 0,
            error_code: errorCode,
            error_type: errorType,
            message: `API-Fehler (${errorCode}): ${errorMessage}`
          }), {
            status: response.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`${errorCode}: ${errorMessage}`);
      }

      const data: PaginatedResponse = await response.json();
      
      if (data.data && data.data.length > 0) {
        allMedia = [...allMedia, ...data.data];
        console.log(`${logPrefix}: Page ${pageCount}: Got ${data.data.length} posts, total now: ${allMedia.length}`);
      }

      // For sync_recent and force_resync, only fetch first page
      if (mode === 'sync_recent' || mode === 'force_resync') {
        break;
      }

      // Check for next page (full import only)
      if (data.paging?.next && allMedia.length < MAX_POSTS) {
        currentUrl = data.paging.next;
      } else {
        break;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`${logPrefix} complete: ${allMedia.length} posts fetched in ${pageCount} pages`);

    if (allMedia.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        imported: 0,
        synced: 0,
        message: 'Keine Posts gefunden'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch insights for each post (with rate limiting)
    console.log(`${logPrefix}: Fetching deep insights for ${allMedia.length} posts...`);
    
    const mediaWithInsights: Array<InstagramMedia & { insights: MediaInsights }> = [];
    
    for (let i = 0; i < allMedia.length; i++) {
      const media = allMedia[i];
      
      // Fetch insights for this media
      const insights = await fetchMediaInsights(media.id, accessToken, media.media_type);
      mediaWithInsights.push({ ...media, insights });
      
      // Rate limiting: pause every 10 requests to avoid hitting API limits
      if ((i + 1) % 10 === 0) {
        console.log(`${logPrefix}: Processed insights for ${i + 1}/${allMedia.length} posts`);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`${logPrefix}: Insights fetched for all ${allMedia.length} posts`);

    // Prepare data for upsert with deep metrics
    const postsToUpsert = mediaWithInsights.map(media => {
      const likes = media.like_count || 0;
      const comments = media.comments_count || 0;
      const saved = media.insights.saved || 0;
      const reach = media.insights.reach || 0;
      const impressions = media.insights.impressions || 0;
      const engagementRate = calculateEngagementRate(likes, comments, saved, reach);

      return {
        user_id: user.id,
        ig_media_id: media.id,
        caption: media.caption || null,
        status: 'PUBLISHED' as const,
        format: media.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : 'single',
        published_at: media.timestamp,
        original_ig_permalink: media.permalink || null,
        original_media_url: media.media_url || null,
        likes_count: likes,
        comments_count: comments,
        saved_count: saved,
        reach_count: reach,
        impressions_count: impressions,
        engagement_rate: engagementRate,
        is_imported: true,
      };
    });

    // Batch upsert
    const UPSERT_BATCH_SIZE = 100;
    let upsertedCount = 0;

    for (let i = 0; i < postsToUpsert.length; i += UPSERT_BATCH_SIZE) {
      const batch = postsToUpsert.slice(i, i + UPSERT_BATCH_SIZE);
      
      // Use user_id + ig_media_id as conflict target for proper upsert
      const { data: upsertedData, error: upsertError } = await supabase
        .from('posts')
        .upsert(batch, { 
          onConflict: 'ig_media_id'
        })
        .select();

      if (upsertError) {
        console.error(`Batch ${i / UPSERT_BATCH_SIZE + 1} error:`, upsertError);
      } else {
        upsertedCount += upsertedData?.length || 0;
      }

      console.log(`${logPrefix}: Upserted batch ${i / UPSERT_BATCH_SIZE + 1}: ${batch.length} posts`);
    }

    // Update last_sync_at timestamp
    await supabase
      .from('settings')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', user.id);

    // For sync_recent or force_resync, return minimal response
    if (mode === 'sync_recent' || mode === 'force_resync') {
      // Log the sync (only if we actually synced something)
      if (upsertedCount > 0) {
        await supabase.from('logs').insert({
          user_id: user.id,
          event_type: mode === 'force_resync' ? 'instagram_force_resync' : 'instagram_smart_sync',
          level: 'info',
          details: {
            synced_count: upsertedCount,
            mode: mode,
            fetched_from_api: allMedia.length,
          },
        });
      }

      const actionLabel = mode === 'force_resync' ? 'repariert & aktualisiert' : 'synchronisiert';
      return new Response(JSON.stringify({ 
        success: true,
        synced: upsertedCount,
        fetched: allMedia.length,
        message: `${upsertedCount} Posts ${actionLabel}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Full import: Calculate top performers
    const allScores = postsToUpsert.map(p => 
      calculateViralityScore(p.likes_count, p.comments_count, p.saved_count)
    );
    allScores.sort((a, b) => b - a);
    const top1PercentThreshold = allScores[Math.max(0, Math.floor(allScores.length * 0.01) - 1)] || 0;
    const unicornCount = allScores.filter(s => s >= top1PercentThreshold).length;

    // Log the import
    await supabase.from('logs').insert({
      user_id: user.id,
      event_type: 'instagram_history_imported',
      level: 'info',
      details: {
        total_fetched: allMedia.length,
        pages_fetched: pageCount,
        inserted_count: upsertedCount,
        top_1_percent_threshold: top1PercentThreshold,
        unicorn_count: unicornCount,
      },
    });

    // Find best performing post
    let bestPost = postsToUpsert[0];
    let bestScore = 0;
    for (const post of postsToUpsert) {
      const score = calculateViralityScore(post.likes_count, post.comments_count, post.saved_count);
      if (score > bestScore) {
        bestScore = score;
        bestPost = post;
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      imported: allMedia.length,
      pages_fetched: pageCount,
      unicorn_count: unicornCount,
      top_score_threshold: top1PercentThreshold,
      best_performer: {
        caption_preview: bestPost.caption?.substring(0, 100) + '...',
        likes: bestPost.likes_count,
        comments: bestPost.comments_count,
        score: bestScore,
        image_url: bestPost.original_media_url,
      },
      message: `${allMedia.length} Posts importiert, ${unicornCount} Top-Performer identifiziert`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false,
      error: message,
      error_code: 500,
      message: `Serverfehler: ${message}`
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
