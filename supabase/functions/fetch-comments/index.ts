import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InstagramComment {
  id: string;
  text: string;
  timestamp: string;
  username?: string;
  from?: {
    id: string;
    username: string;
  };
  replies?: {
    data: InstagramComment[];
  };
}

interface MediaWithComments {
  id: string;
  comments?: {
    data: InstagramComment[];
    paging?: { next: string };
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`[fetch-comments] Starting for user ${user.id}`);

    // Get Instagram connection
    const { data: connection, error: connError } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (connError || !connection?.token_encrypted) {
      throw new Error('Instagram nicht verbunden');
    }

    const accessToken = connection.token_encrypted;
    const igUserId = connection.ig_user_id;

    // Calculate 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch recent media (last 30 days)
    const mediaUrl = `https://graph.facebook.com/v17.0/${igUserId}/media?fields=id,timestamp&limit=50&access_token=${accessToken}`;
    
    console.log(`[fetch-comments] Fetching media from last 30 days`);
    
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) {
      const errorData = await mediaResponse.json();
      console.error('Media fetch error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to fetch media');
    }

    const mediaData = await mediaResponse.json();
    const recentMedia = mediaData.data?.filter((m: any) => 
      new Date(m.timestamp) >= thirtyDaysAgo
    ) || [];

    console.log(`[fetch-comments] Found ${recentMedia.length} posts from last 30 days`);

    // Fetch comments for each media
    let allComments: any[] = [];
    let myRepliedCommentIds: Set<string> = new Set();

    for (const media of recentMedia) {
      // Fetch comments with replies
      const commentsUrl = `https://graph.facebook.com/v17.0/${media.id}/comments?fields=id,text,timestamp,username,from,replies{id,text,timestamp,username,from}&limit=100&access_token=${accessToken}`;
      
      try {
        const commentsResponse = await fetch(commentsUrl);
        if (!commentsResponse.ok) {
          console.error(`Failed to fetch comments for media ${media.id}`);
          continue;
        }

        const commentsData = await commentsResponse.json();
        const comments = commentsData.data || [];

        for (const comment of comments) {
          // Check if I've replied to this comment
          const hasMyReply = comment.replies?.data?.some(
            (reply: InstagramComment) => reply.from?.id === igUserId || reply.username === connection.ig_username
          );

          if (hasMyReply) {
            myRepliedCommentIds.add(comment.id);
          }

          // Don't include my own comments
          if (comment.from?.id !== igUserId && comment.username !== connection.ig_username) {
            allComments.push({
              ig_comment_id: comment.id,
              ig_media_id: media.id,
              commenter_username: comment.username || comment.from?.username || 'Unknown',
              commenter_id: comment.from?.id || null,
              comment_text: comment.text,
              comment_timestamp: comment.timestamp,
              is_replied: hasMyReply || false,
            });
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        console.error(`Error fetching comments for ${media.id}:`, err);
      }
    }

    console.log(`[fetch-comments] Found ${allComments.length} total comments, ${allComments.filter(c => !c.is_replied).length} unreplied`);

    // Upsert comments to database
    const commentsToUpsert = allComments.map(c => ({
      user_id: user.id,
      ...c,
    }));

    if (commentsToUpsert.length > 0) {
      const { error: upsertError } = await supabase
        .from('instagram_comments')
        .upsert(commentsToUpsert, { onConflict: 'ig_comment_id' });

      if (upsertError) {
        console.error('Upsert error:', upsertError);
      }
    }

    // Log event
    await supabase.from('logs').insert({
      user_id: user.id,
      event_type: 'comments_fetched',
      level: 'info',
      details: {
        total_comments: allComments.length,
        unreplied: allComments.filter(c => !c.is_replied).length,
        media_count: recentMedia.length
      }
    });

    return new Response(JSON.stringify({
      success: true,
      total: allComments.length,
      unreplied: allComments.filter(c => !c.is_replied).length,
      media_count: recentMedia.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[fetch-comments] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
