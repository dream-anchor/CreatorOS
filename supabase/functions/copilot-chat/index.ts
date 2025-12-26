import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tool definitions for the AI agent
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_posts",
      description: "Sucht in der Datenbank nach Posts basierend auf Caption, Kommentaren oder Stichwörtern. Nutze dies wenn der User nach bestimmten Themen, Posts oder Kommentaren fragt.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Suchbegriff(e) für die Volltextsuche in Captions und Kommentaren"
          },
          limit: {
            type: "number",
            description: "Maximale Anzahl der Ergebnisse (Standard: 5)"
          },
          filter_unanswered: {
            type: "boolean",
            description: "Nur Posts mit unbeantworteten Kommentaren zeigen"
          },
          date_filter: {
            type: "string",
            description: "Zeitfilter: 'today', 'yesterday', 'week', 'month' oder leer für alle"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_sentiment",
      description: "Analysiert die Stimmung und Reaktionen auf einen bestimmten Post. Nutze dies wenn der User wissen will wie die Community auf einen Post reagiert hat.",
      parameters: {
        type: "object",
        properties: {
          post_id: {
            type: "string",
            description: "Die UUID des Posts"
          },
          ig_media_id: {
            type: "string",
            description: "Die Instagram Media ID des Posts (alternativ zu post_id)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "draft_reply",
      description: "Erstellt einen Antwort-Entwurf für einen Kommentar basierend auf der User-Persona. Nutze dies wenn der User eine Antwort auf einen Kommentar haben möchte.",
      parameters: {
        type: "object",
        properties: {
          comment_id: {
            type: "string",
            description: "Die UUID des Kommentars"
          },
          instruction: {
            type: "string",
            description: "Spezielle Anweisungen für die Antwort (z.B. 'witzig', 'mit Zitat aus XY', 'kurz')"
          }
        },
        required: ["comment_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_open_comments",
      description: "Holt alle unbeantworteten Kommentare, optional gefiltert nach Zeitraum oder Kritikalität. Nutze dies wenn der User wissen will welche Kommentare noch offen sind.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximale Anzahl (Standard: 10)"
          },
          only_critical: {
            type: "boolean",
            description: "Nur kritische Kommentare zeigen"
          },
          date_filter: {
            type: "string",
            description: "Zeitfilter: 'today', 'yesterday', 'week'"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_data",
      description: "Analysiert Statistiken und Daten aus der Datenbank. Nutze dies für Performance-Reports, Zeitraum-Vergleiche und Engagement-Analysen. IMMER nutzen wenn der User nach Zahlen, Statistiken oder Performance fragt.",
      parameters: {
        type: "object",
        properties: {
          time_period: {
            type: "string",
            description: "Zeitraum: 'today', 'yesterday', 'last_week', 'last_month', 'this_month', 'last_3_months', 'custom'"
          },
          start_date: {
            type: "string",
            description: "Start-Datum für custom Zeitraum (YYYY-MM-DD)"
          },
          end_date: {
            type: "string",
            description: "End-Datum für custom Zeitraum (YYYY-MM-DD)"
          },
          metric_type: {
            type: "string",
            description: "Was analysieren: 'overview' (Gesamt), 'engagement' (Likes/Comments), 'posts' (Post-Anzahl), 'top_posts' (Best-Performer), 'comments' (Kommentar-Analyse), 'comparison' (Zeitraum-Vergleich)"
          },
          compare_with_previous: {
            type: "boolean",
            description: "Mit vorherigem Zeitraum vergleichen (für Wachstum/Trend)"
          }
        },
        required: ["time_period", "metric_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_account_summary",
      description: "Holt eine Gesamtübersicht des Accounts: Alle Posts, Gesamtstatistiken, Themen. Nutze dies für allgemeine Fragen wie 'Wie läuft es?' oder 'Gib mir einen Überblick'.",
      parameters: {
        type: "object",
        properties: {
          include_topics: {
            type: "boolean",
            description: "Themen/Topics mit einbeziehen"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_growth",
      description: "Analysiert Follower-Wachstum, Reichweite und Account-Performance über Zeit. NUTZE DIES bei Fragen zu Wachstum, Stagnation, Reichweite, Trends, 'Warum sinkt...', 'Wie entwickelt sich...'",
      parameters: {
        type: "object",
        properties: {
          start_date: {
            type: "string",
            description: "Start-Datum (YYYY-MM-DD)"
          },
          end_date: {
            type: "string",
            description: "End-Datum (YYYY-MM-DD), default: heute"
          },
          include_strategy: {
            type: "boolean",
            description: "Strategische Empfehlungen basierend auf Best-Performer Posts generieren"
          }
        },
        required: ["start_date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "trigger_insights_tracking",
      description: "Startet manuell das Tracking der täglichen Instagram-Insights. Nutze dies wenn der User 'Tracke meine Insights' oder 'Hol aktuelle Zahlen' sagt.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_content_categories",
      description: "Analysiert Posts nach Kategorien, Stimmung und Themen-Tags. NUTZE DIES bei Fragen wie 'Welche Kategorie performt am besten?', 'Was bringt am meisten Reichweite?', 'Welche Themen laufen gut?', 'Wie unterscheiden sich meine Humor-Posts von Promo?'",
      parameters: {
        type: "object",
        properties: {
          group_by: {
            type: "string",
            description: "Gruppieren nach: 'category' (Humor, Promo etc.), 'mood' (Stimmung), 'topic_tags' (Themen)",
            enum: ["category", "mood", "topic_tags"]
          },
          metric: {
            type: "string",
            description: "Metrik zum Vergleichen: 'engagement' (Likes+Comments+Saves), 'reach' (Reichweite), 'engagement_rate' (Engagement pro Reichweite)",
            enum: ["engagement", "reach", "engagement_rate"]
          },
          time_period: {
            type: "string",
            description: "Zeitraum: 'all_time', 'last_month', 'last_3_months'",
            enum: ["all_time", "last_month", "last_3_months"]
          },
          include_recommendations: {
            type: "boolean",
            description: "Strategische Empfehlungen basierend auf den Daten generieren"
          }
        },
        required: ["group_by", "metric"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "classify_posts_batch",
      description: "Klassifiziert unklassifizierte Posts mit AI. NUTZE DIES wenn der User 'Analysiere meine Posts', 'Tagge meine Inhalte' oder 'Klassifiziere' sagt.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Anzahl zu klassifizierender Posts (Standard: 10, Max: 20)"
          }
        }
      }
    }
  }
];

// Tool implementations
async function executeSearchPosts(supabase: any, userId: string, params: any) {
  const { query, limit = 5, filter_unanswered = false, date_filter } = params;
  
  console.log(`[copilot] Searching posts for query: "${query}"`);
  
  // Build date filter
  let dateCondition = '';
  const now = new Date();
  if (date_filter === 'today') {
    dateCondition = `AND published_at >= '${now.toISOString().split('T')[0]}'`;
  } else if (date_filter === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    dateCondition = `AND published_at >= '${yesterday.toISOString().split('T')[0]}' AND published_at < '${now.toISOString().split('T')[0]}'`;
  } else if (date_filter === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    dateCondition = `AND published_at >= '${weekAgo.toISOString()}'`;
  }
  
  // Search in posts
  let postsQuery = supabase
    .from('posts')
    .select('id, ig_media_id, caption, original_media_url, original_ig_permalink, published_at, likes_count, comments_count, status')
    .eq('user_id', userId)
    .eq('status', 'PUBLISHED')
    .ilike('caption', `%${query}%`)
    .order('published_at', { ascending: false })
    .limit(limit);
  
  const { data: posts, error: postsError } = await postsQuery;
  
  if (postsError) {
    console.error('[copilot] Search posts error:', postsError);
    return { error: 'Fehler bei der Suche', posts: [] };
  }
  
  // Also search in comments
  const { data: commentsWithPosts } = await supabase
    .from('instagram_comments')
    .select('ig_media_id, comment_text')
    .eq('user_id', userId)
    .ilike('comment_text', `%${query}%`)
    .limit(20);
  
  // Get unique media IDs from comments
  const commentMediaIds = [...new Set((commentsWithPosts || []).map((c: any) => c.ig_media_id))];
  
  // Fetch those posts too
  let additionalPosts: any[] = [];
  if (commentMediaIds.length > 0) {
    const { data: morePosts } = await supabase
      .from('posts')
      .select('id, ig_media_id, caption, original_media_url, original_ig_permalink, published_at, likes_count, comments_count, status')
      .eq('user_id', userId)
      .in('ig_media_id', commentMediaIds)
      .limit(limit);
    
    additionalPosts = morePosts || [];
  }
  
  // Merge and deduplicate
  const allPosts = [...(posts || [])];
  for (const p of additionalPosts) {
    if (!allPosts.find((existing: any) => existing.id === p.id)) {
      allPosts.push(p);
    }
  }
  
  // If filter_unanswered, check for unanswered comments
  if (filter_unanswered && allPosts.length > 0) {
    const mediaIds = allPosts.map((p: any) => p.ig_media_id).filter(Boolean);
    const { data: unansweredComments } = await supabase
      .from('instagram_comments')
      .select('ig_media_id')
      .eq('user_id', userId)
      .eq('is_replied', false)
      .eq('is_hidden', false)
      .in('ig_media_id', mediaIds);
    
    const unansweredMediaIds = new Set((unansweredComments || []).map((c: any) => c.ig_media_id));
    return {
      posts: allPosts.filter((p: any) => unansweredMediaIds.has(p.ig_media_id)).slice(0, limit),
      total_found: allPosts.length
    };
  }
  
  return {
    posts: allPosts.slice(0, limit),
    total_found: allPosts.length
  };
}

async function executeAnalyzeSentiment(supabase: any, userId: string, params: any) {
  const { post_id, ig_media_id } = params;
  
  console.log(`[copilot] Analyzing sentiment for post: ${post_id || ig_media_id}`);
  
  // Get post
  let postQuery = supabase
    .from('posts')
    .select('id, ig_media_id, caption, original_media_url, published_at, likes_count, comments_count')
    .eq('user_id', userId);
  
  if (post_id) {
    postQuery = postQuery.eq('id', post_id);
  } else if (ig_media_id) {
    postQuery = postQuery.eq('ig_media_id', ig_media_id);
  }
  
  const { data: post, error: postError } = await postQuery.single();
  
  if (postError || !post) {
    return { error: 'Post nicht gefunden' };
  }
  
  // Get comments with sentiment
  const { data: comments } = await supabase
    .from('instagram_comments')
    .select('id, comment_text, commenter_username, sentiment_score, is_critical, is_replied')
    .eq('user_id', userId)
    .eq('ig_media_id', post.ig_media_id)
    .eq('is_hidden', false);
  
  const totalComments = comments?.length || 0;
  const criticalCount = comments?.filter((c: any) => c.is_critical).length || 0;
  const repliedCount = comments?.filter((c: any) => c.is_replied).length || 0;
  const avgSentiment = comments?.reduce((sum: number, c: any) => sum + (c.sentiment_score || 0), 0) / (totalComments || 1);
  
  // Categorize sentiment
  const positive = comments?.filter((c: any) => (c.sentiment_score || 0) > 0.3).length || 0;
  const negative = comments?.filter((c: any) => (c.sentiment_score || 0) < -0.3).length || 0;
  const neutral = totalComments - positive - negative;
  
  return {
    post: {
      id: post.id,
      ig_media_id: post.ig_media_id,
      caption: post.caption?.substring(0, 200) + '...',
      image_url: post.original_media_url,
      published_at: post.published_at,
      likes: post.likes_count,
      comments: post.comments_count
    },
    sentiment_analysis: {
      total_comments: totalComments,
      average_sentiment: Math.round(avgSentiment * 100) / 100,
      sentiment_label: avgSentiment > 0.3 ? '😊 Positiv' : avgSentiment < -0.3 ? '😠 Negativ' : '😐 Neutral',
      breakdown: {
        positive,
        neutral,
        negative
      },
      critical_count: criticalCount,
      replied_count: repliedCount,
      reply_rate: totalComments > 0 ? Math.round((repliedCount / totalComments) * 100) : 0
    },
    sample_comments: comments?.slice(0, 3).map((c: any) => ({
      id: c.id,
      text: c.comment_text,
      username: c.commenter_username,
      sentiment: c.sentiment_score
    }))
  };
}

async function executeDraftReply(supabase: any, userId: string, params: any, brandRules: any) {
  const { comment_id, instruction = '' } = params;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  
  console.log(`[copilot] Drafting reply for comment: ${comment_id}`);
  
  // Get comment with post context
  const { data: comment, error: commentError } = await supabase
    .from('instagram_comments')
    .select('id, comment_text, commenter_username, ig_media_id')
    .eq('id', comment_id)
    .eq('user_id', userId)
    .single();
  
  if (commentError || !comment) {
    return { error: 'Kommentar nicht gefunden' };
  }
  
  // Get post caption
  const { data: post } = await supabase
    .from('posts')
    .select('caption, original_media_url')
    .eq('ig_media_id', comment.ig_media_id)
    .single();
  
  // Get few-shot examples
  const { data: pastReplies } = await supabase
    .from('reply_queue')
    .select('reply_text')
    .eq('user_id', userId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(10);
  
  const examples = (pastReplies || [])
    .map((r: any) => r.reply_text)
    .filter((t: string) => t && t.length > 3)
    .slice(0, 5);
  
  const toneStyle = brandRules?.tone_style || 'locker und authentisch';
  const formalityMode = brandRules?.formality_mode || 'smart';
  
  const systemPrompt = `Du bist ICH (Antoine). Du schreibst eine Antwort auf einen Fan-Kommentar.

STIL-BEISPIELE (kopiere den Vibe):
${examples.map((ex: string, i: number) => `${i + 1}. ${ex}`).join('\n') || '(keine Beispiele)'}

REGELN:
- IMMER 1. Person Singular ("Ich")
- NIEMALS "Wir/Uns/Unser"
- Keine Hashtags
- Keine Signaturen (LG, Grüße, etc.)
- Kurz und natürlich (1-2 Sätze)

TONALITÄT: ${toneStyle}
FORMALITÄT: ${formalityMode === 'sie' ? 'Siezen' : formalityMode === 'du' ? 'Duzen' : 'Smart (wie der Fan spricht)'}

${instruction ? `SPEZIELLE ANWEISUNG: ${instruction}` : ''}`;

  const userMessage = `POST-CAPTION: "${post?.caption?.substring(0, 500) || 'N/A'}"

KOMMENTAR von @${comment.commenter_username}:
"${comment.comment_text}"

Schreibe die Antwort:`;

  try {
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error('AI generation failed');
    }

    const aiData = await aiResponse.json();
    const draftReply = (aiData.choices?.[0]?.message?.content || '').trim();

    return {
      comment: {
        id: comment.id,
        text: comment.comment_text,
        username: comment.commenter_username
      },
      post: {
        caption: post?.caption?.substring(0, 100) + '...',
        image_url: post?.original_media_url
      },
      draft_reply: draftReply,
      instruction_used: instruction || 'Standard-Persona'
    };
  } catch (error) {
    console.error('[copilot] Draft reply error:', error);
    return { error: 'Fehler bei der Generierung' };
  }
}

async function executeGetOpenComments(supabase: any, userId: string, params: any) {
  const { limit = 10, only_critical = false, date_filter } = params;
  
  console.log(`[copilot] Getting open comments, limit: ${limit}, critical: ${only_critical}`);
  
  let query = supabase
    .from('instagram_comments')
    .select('id, comment_text, commenter_username, comment_timestamp, ig_media_id, is_critical, sentiment_score')
    .eq('user_id', userId)
    .eq('is_replied', false)
    .eq('is_hidden', false)
    .order('comment_timestamp', { ascending: false });
  
  if (only_critical) {
    query = query.eq('is_critical', true);
  }
  
  // Date filter
  const now = new Date();
  if (date_filter === 'today') {
    query = query.gte('comment_timestamp', now.toISOString().split('T')[0]);
  } else if (date_filter === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    query = query.gte('comment_timestamp', yesterday.toISOString().split('T')[0])
                 .lt('comment_timestamp', now.toISOString().split('T')[0]);
  } else if (date_filter === 'week') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    query = query.gte('comment_timestamp', weekAgo.toISOString());
  }
  
  const { data: comments, error } = await query.limit(limit);
  
  if (error) {
    return { error: 'Fehler beim Laden der Kommentare' };
  }
  
  // Get post info for each comment
  const mediaIds = [...new Set((comments || []).map((c: any) => c.ig_media_id))];
  const { data: posts } = await supabase
    .from('posts')
    .select('ig_media_id, caption, original_media_url, original_ig_permalink')
    .in('ig_media_id', mediaIds);
  
  const postMap = new Map<string, any>((posts || []).map((p: any) => [p.ig_media_id, p]));
  
  return {
    total_open: comments?.length || 0,
    comments: (comments || []).map((c: any) => {
      const post = postMap.get(c.ig_media_id) as any;
      return {
        id: c.id,
        text: c.comment_text,
        username: c.commenter_username,
        timestamp: c.comment_timestamp,
        is_critical: c.is_critical,
        sentiment: c.sentiment_score,
        post: post ? {
          caption: (post.caption || '').substring(0, 80) + '...',
          image_url: post.original_media_url || null,
          permalink: post.original_ig_permalink || null
        } : null
      };
    })
  };
}

// Helper to calculate date ranges
function getDateRange(timePeriod: string, startDate?: string, endDate?: string): { start: string; end: string; previousStart?: string; previousEnd?: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  let start: Date;
  let end = new Date(now);
  
  switch (timePeriod) {
    case 'today':
      start = new Date(today);
      break;
    case 'yesterday':
      start = new Date(now);
      start.setDate(start.getDate() - 1);
      end = new Date(today);
      break;
    case 'last_week':
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      break;
    case 'last_month':
      start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      break;
    case 'this_month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_3_months':
      start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      break;
    case 'custom':
      if (startDate && endDate) {
        start = new Date(startDate);
        end = new Date(endDate);
      } else {
        start = new Date(now);
        start.setMonth(start.getMonth() - 1);
      }
      break;
    default:
      start = new Date(now);
      start.setMonth(start.getMonth() - 1);
  }
  
  // Calculate previous period for comparison
  const periodLength = end.getTime() - start.getTime();
  const previousEnd = new Date(start);
  const previousStart = new Date(previousEnd.getTime() - periodLength);
  
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: previousEnd.toISOString()
  };
}

// Tool: Analyze Data - Real database queries
async function executeAnalyzeData(supabase: any, userId: string, params: any) {
  const { time_period, start_date, end_date, metric_type, compare_with_previous = true } = params;
  
  console.log(`[copilot] Analyzing data: ${metric_type} for ${time_period}`);
  
  const dateRange = getDateRange(time_period, start_date, end_date);
  
  // Current period data
  const { data: currentPosts, error: postsError } = await supabase
    .from('posts')
    .select('id, caption, published_at, likes_count, comments_count, saved_count, impressions_count, status, format')
    .eq('user_id', userId)
    .eq('status', 'PUBLISHED')
    .gte('published_at', dateRange.start)
    .lte('published_at', dateRange.end)
    .order('published_at', { ascending: false });
  
  if (postsError) {
    console.error('[copilot] Posts query error:', postsError);
    return { error: 'Fehler beim Laden der Posts' };
  }
  
  const posts = currentPosts || [];
  
  // Calculate current period stats
  const totalPosts = posts.length;
  const totalLikes = posts.reduce((sum: number, p: any) => sum + (p.likes_count || 0), 0);
  const totalComments = posts.reduce((sum: number, p: any) => sum + (p.comments_count || 0), 0);
  const totalSaved = posts.reduce((sum: number, p: any) => sum + (p.saved_count || 0), 0);
  const totalImpressions = posts.reduce((sum: number, p: any) => sum + (p.impressions_count || 0), 0);
  const avgLikesPerPost = totalPosts > 0 ? Math.round(totalLikes / totalPosts) : 0;
  const avgCommentsPerPost = totalPosts > 0 ? Math.round(totalComments / totalPosts) : 0;
  
  // Get comment data for this period
  const { data: periodComments } = await supabase
    .from('instagram_comments')
    .select('id, sentiment_score, is_critical, is_replied')
    .eq('user_id', userId)
    .gte('comment_timestamp', dateRange.start)
    .lte('comment_timestamp', dateRange.end);
  
  const comments = periodComments || [];
  const openComments = comments.filter((c: any) => !c.is_replied).length;
  const criticalComments = comments.filter((c: any) => c.is_critical).length;
  const avgSentiment = comments.length > 0 
    ? comments.reduce((sum: number, c: any) => sum + (c.sentiment_score || 0), 0) / comments.length 
    : 0;
  
  // Previous period comparison
  let comparison: any = null;
  if (compare_with_previous && dateRange.previousStart && dateRange.previousEnd) {
    const { data: previousPosts } = await supabase
      .from('posts')
      .select('id, likes_count, comments_count')
      .eq('user_id', userId)
      .eq('status', 'PUBLISHED')
      .gte('published_at', dateRange.previousStart)
      .lt('published_at', dateRange.start);
    
    const prevPosts = previousPosts || [];
    const prevTotalPosts = prevPosts.length;
    const prevTotalLikes = prevPosts.reduce((sum: number, p: any) => sum + (p.likes_count || 0), 0);
    const prevTotalComments = prevPosts.reduce((sum: number, p: any) => sum + (p.comments_count || 0), 0);
    
    comparison = {
      posts_change: prevTotalPosts > 0 ? Math.round(((totalPosts - prevTotalPosts) / prevTotalPosts) * 100) : null,
      likes_change: prevTotalLikes > 0 ? Math.round(((totalLikes - prevTotalLikes) / prevTotalLikes) * 100) : null,
      comments_change: prevTotalComments > 0 ? Math.round(((totalComments - prevTotalComments) / prevTotalComments) * 100) : null,
      previous_period: {
        posts: prevTotalPosts,
        likes: prevTotalLikes,
        comments: prevTotalComments
      }
    };
  }
  
  // Build response based on metric_type
  const baseResult = {
    period: {
      label: time_period === 'custom' ? `${start_date} bis ${end_date}` : time_period,
      start: dateRange.start.split('T')[0],
      end: dateRange.end.split('T')[0]
    }
  };
  
  switch (metric_type) {
    case 'overview':
      return {
        ...baseResult,
        overview: {
          total_posts: totalPosts,
          total_likes: totalLikes,
          total_comments: totalComments,
          total_saved: totalSaved,
          total_impressions: totalImpressions,
          avg_likes_per_post: avgLikesPerPost,
          avg_comments_per_post: avgCommentsPerPost,
          engagement_rate: totalImpressions > 0 
            ? `${((totalLikes + totalComments) / totalImpressions * 100).toFixed(2)}%` 
            : 'N/A (keine Impressions)',
          open_comments: openComments,
          critical_comments: criticalComments,
          avg_sentiment: avgSentiment > 0.3 ? '😊 Positiv' : avgSentiment < -0.3 ? '😠 Negativ' : '😐 Neutral'
        },
        comparison,
        hint: "WICHTIG: Wir speichern keine Follower-Historie. Für Wachstums-Analysen nutze Engagement (Likes+Comments) als Proxy."
      };
      
    case 'engagement':
      return {
        ...baseResult,
        engagement: {
          total_likes: totalLikes,
          total_comments: totalComments,
          total_saved: totalSaved,
          avg_likes_per_post: avgLikesPerPost,
          avg_comments_per_post: avgCommentsPerPost,
          best_like_post: posts.sort((a: any, b: any) => (b.likes_count || 0) - (a.likes_count || 0))[0] || null,
          most_discussed_post: posts.sort((a: any, b: any) => (b.comments_count || 0) - (a.comments_count || 0))[0] || null
        },
        comparison
      };
      
    case 'posts':
      return {
        ...baseResult,
        posts_analysis: {
          total_count: totalPosts,
          by_format: {
            single: posts.filter((p: any) => p.format === 'single').length,
            carousel: posts.filter((p: any) => p.format === 'carousel').length
          },
          recent_posts: posts.slice(0, 5).map((p: any) => ({
            id: p.id,
            caption: (p.caption || '').substring(0, 80) + '...',
            published_at: p.published_at,
            likes: p.likes_count,
            comments: p.comments_count
          }))
        },
        comparison
      };
      
    case 'top_posts':
      const sortedByLikes = [...posts].sort((a: any, b: any) => (b.likes_count || 0) - (a.likes_count || 0));
      const sortedByComments = [...posts].sort((a: any, b: any) => (b.comments_count || 0) - (a.comments_count || 0));
      
      return {
        ...baseResult,
        top_posts: {
          by_likes: sortedByLikes.slice(0, 3).map((p: any) => ({
            id: p.id,
            caption: (p.caption || '').substring(0, 80) + '...',
            likes: p.likes_count,
            comments: p.comments_count
          })),
          by_comments: sortedByComments.slice(0, 3).map((p: any) => ({
            id: p.id,
            caption: (p.caption || '').substring(0, 80) + '...',
            likes: p.likes_count,
            comments: p.comments_count
          }))
        }
      };
      
    case 'comments':
      return {
        ...baseResult,
        comments_analysis: {
          total_received: comments.length,
          open_comments: openComments,
          replied_comments: comments.filter((c: any) => c.is_replied).length,
          critical_comments: criticalComments,
          reply_rate: comments.length > 0 ? `${Math.round((comments.filter((c: any) => c.is_replied).length / comments.length) * 100)}%` : 'N/A',
          avg_sentiment_score: Math.round(avgSentiment * 100) / 100,
          sentiment_label: avgSentiment > 0.3 ? '😊 Überwiegend positiv' : avgSentiment < -0.3 ? '😠 Überwiegend negativ' : '😐 Gemischt/Neutral'
        }
      };
      
    case 'comparison':
      if (!comparison) {
        return { ...baseResult, error: 'Kein Vergleichszeitraum verfügbar' };
      }
      return {
        ...baseResult,
        current_period: {
          posts: totalPosts,
          likes: totalLikes,
          comments: totalComments
        },
        comparison,
        growth_summary: {
          posts: comparison.posts_change !== null ? `${comparison.posts_change > 0 ? '+' : ''}${comparison.posts_change}%` : 'N/A',
          likes: comparison.likes_change !== null ? `${comparison.likes_change > 0 ? '+' : ''}${comparison.likes_change}%` : 'N/A',
          comments: comparison.comments_change !== null ? `${comparison.comments_change > 0 ? '+' : ''}${comparison.comments_change}%` : 'N/A'
        }
      };
      
    default:
      return { ...baseResult, error: 'Unbekannter metric_type' };
  }
}

// Tool: Get Account Summary
async function executeGetAccountSummary(supabase: any, userId: string, params: any) {
  const { include_topics = true } = params;
  
  console.log(`[copilot] Getting account summary`);
  
  // All-time stats
  const { data: allPosts } = await supabase
    .from('posts')
    .select('id, likes_count, comments_count, status, published_at')
    .eq('user_id', userId);
  
  const posts = allPosts || [];
  const publishedPosts = posts.filter((p: any) => p.status === 'PUBLISHED');
  
  const totalLikes = publishedPosts.reduce((sum: number, p: any) => sum + (p.likes_count || 0), 0);
  const totalComments = publishedPosts.reduce((sum: number, p: any) => sum + (p.comments_count || 0), 0);
  
  // Draft/scheduled counts
  const draftPosts = posts.filter((p: any) => p.status === 'DRAFT').length;
  const scheduledPosts = posts.filter((p: any) => p.status === 'SCHEDULED').length;
  
  // Open comments
  const { data: openComments } = await supabase
    .from('instagram_comments')
    .select('id')
    .eq('user_id', userId)
    .eq('is_replied', false)
    .eq('is_hidden', false);
  
  // Topics
  let topics: any[] = [];
  if (include_topics) {
    const { data: topicsData } = await supabase
      .from('topics')
      .select('id, title, priority, evergreen')
      .eq('user_id', userId)
      .order('priority', { ascending: false })
      .limit(10);
    topics = topicsData || [];
  }
  
  // Last 30 days activity
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentPosts = publishedPosts.filter((p: any) => 
    p.published_at && new Date(p.published_at) >= thirtyDaysAgo
  );
  
  return {
    account_overview: {
      total_published_posts: publishedPosts.length,
      total_likes: totalLikes,
      total_comments: totalComments,
      drafts_pending: draftPosts,
      scheduled_posts: scheduledPosts,
      open_comments: openComments?.length || 0
    },
    last_30_days: {
      posts_published: recentPosts.length,
      likes_received: recentPosts.reduce((sum: number, p: any) => sum + (p.likes_count || 0), 0),
      comments_received: recentPosts.reduce((sum: number, p: any) => sum + (p.comments_count || 0), 0),
      avg_posts_per_week: Math.round((recentPosts.length / 4) * 10) / 10
    },
    topics: topics.map((t: any) => ({
      title: t.title,
      priority: t.priority,
      evergreen: t.evergreen
    })),
    hint: "Nutze die daily_account_stats Tabelle für historische Follower- und Reichweiten-Daten."
  };
}

// Tool: Analyze Growth - Uses daily_account_stats for historical data
async function executeAnalyzeGrowth(supabase: any, userId: string, params: any) {
  const { start_date, end_date, include_strategy = true } = params;
  
  const endDateStr = end_date || new Date().toISOString().split('T')[0];
  
  console.log(`[copilot] Analyzing growth from ${start_date} to ${endDateStr}`);

  // Get daily stats for the period
  const { data: dailyStats, error: statsError } = await supabase
    .from('daily_account_stats')
    .select('*')
    .eq('user_id', userId)
    .gte('date', start_date)
    .lte('date', endDateStr)
    .order('date', { ascending: true });

  if (statsError) {
    console.error('[copilot] Stats query error:', statsError);
    return { error: 'Fehler beim Laden der Statistiken' };
  }

  const stats = dailyStats || [];
  
  if (stats.length === 0) {
    // Try to get engagement data from posts as fallback
    const { data: posts } = await supabase
      .from('posts')
      .select('id, published_at, likes_count, comments_count, impressions_count')
      .eq('user_id', userId)
      .eq('status', 'PUBLISHED')
      .gte('published_at', start_date)
      .lte('published_at', endDateStr)
      .order('published_at', { ascending: true });

    if (!posts || posts.length === 0) {
      return {
        error: 'Keine historischen Daten für diesen Zeitraum. Nutze "Tracke meine Insights" um mit dem Tracking zu starten.',
        suggestion: 'Starte das tägliche Tracking, um Wachstumsdaten zu sammeln.'
      };
    }

    // Fallback: Calculate engagement-based growth
    const totalLikes = posts.reduce((sum: number, p: any) => sum + (p.likes_count || 0), 0);
    const totalComments = posts.reduce((sum: number, p: any) => sum + (p.comments_count || 0), 0);
    const totalImpressions = posts.reduce((sum: number, p: any) => sum + (p.impressions_count || 0), 0);

    return {
      period: { start: start_date, end: endDateStr },
      data_source: 'posts_engagement',
      note: 'Keine täglichen Insights verfügbar. Analyse basiert auf Post-Engagement.',
      engagement_summary: {
        total_posts: posts.length,
        total_likes: totalLikes,
        total_comments: totalComments,
        total_impressions: totalImpressions,
        avg_engagement_per_post: posts.length > 0 ? Math.round((totalLikes + totalComments) / posts.length) : 0
      },
      recommendation: 'Aktiviere das tägliche Insights-Tracking für präzisere Wachstumsanalysen.'
    };
  }

  // Calculate growth metrics from daily stats
  const firstDay = stats[0];
  const lastDay = stats[stats.length - 1];
  
  const followerGrowth = lastDay.follower_count - firstDay.follower_count;
  const followerGrowthPercent = firstDay.follower_count > 0 
    ? ((followerGrowth / firstDay.follower_count) * 100).toFixed(2) 
    : 'N/A';

  const totalImpressions = stats.reduce((sum: number, s: any) => sum + (s.impressions_day || 0), 0);
  const totalReach = stats.reduce((sum: number, s: any) => sum + (s.reach_day || 0), 0);
  const totalProfileViews = stats.reduce((sum: number, s: any) => sum + (s.profile_views || 0), 0);
  const totalWebsiteClicks = stats.reduce((sum: number, s: any) => sum + (s.website_clicks || 0), 0);

  const avgImpressions = stats.length > 0 ? Math.round(totalImpressions / stats.length) : 0;
  const avgReach = stats.length > 0 ? Math.round(totalReach / stats.length) : 0;

  // Trend analysis (compare first half vs second half)
  const midpoint = Math.floor(stats.length / 2);
  const firstHalf = stats.slice(0, midpoint);
  const secondHalf = stats.slice(midpoint);

  const firstHalfReach = firstHalf.reduce((sum: number, s: any) => sum + (s.reach_day || 0), 0);
  const secondHalfReach = secondHalf.reduce((sum: number, s: any) => sum + (s.reach_day || 0), 0);
  
  const reachTrend = firstHalfReach > 0 
    ? (((secondHalfReach - firstHalfReach) / firstHalfReach) * 100).toFixed(1)
    : 'N/A';

  const firstHalfImpressions = firstHalf.reduce((sum: number, s: any) => sum + (s.impressions_day || 0), 0);
  const secondHalfImpressions = secondHalf.reduce((sum: number, s: any) => sum + (s.impressions_day || 0), 0);
  
  const impressionsTrend = firstHalfImpressions > 0
    ? (((secondHalfImpressions - firstHalfImpressions) / firstHalfImpressions) * 100).toFixed(1)
    : 'N/A';

  // Get best performing posts for strategy
  let strategyRecommendations: any = null;
  if (include_strategy) {
    const { data: topPosts } = await supabase
      .from('posts')
      .select('id, caption, published_at, likes_count, comments_count, format')
      .eq('user_id', userId)
      .eq('status', 'PUBLISHED')
      .gte('published_at', start_date)
      .lte('published_at', endDateStr)
      .order('likes_count', { ascending: false })
      .limit(5);

    const bestPosts = topPosts || [];
    
    // Analyze patterns
    const dayOfWeekCounts: Record<string, number> = {};
    const formatCounts: Record<string, { count: number; engagement: number }> = {};
    
    for (const post of bestPosts) {
      const day = new Date(post.published_at).toLocaleDateString('de-DE', { weekday: 'long' });
      dayOfWeekCounts[day] = (dayOfWeekCounts[day] || 0) + 1;
      
      const format = post.format || 'single';
      if (!formatCounts[format]) {
        formatCounts[format] = { count: 0, engagement: 0 };
      }
      formatCounts[format].count++;
      formatCounts[format].engagement += (post.likes_count || 0) + (post.comments_count || 0);
    }

    const bestDay = Object.entries(dayOfWeekCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const bestFormat = Object.entries(formatCounts)
      .sort((a, b) => b[1].engagement - a[1].engagement)[0]?.[0] || 'single';

    strategyRecommendations = {
      best_posting_day: bestDay,
      best_format: bestFormat,
      top_posts: bestPosts.slice(0, 3).map((p: any) => ({
        caption_preview: (p.caption || '').substring(0, 60) + '...',
        likes: p.likes_count,
        comments: p.comments_count,
        format: p.format
      })),
      insights: []
    };

    // Generate insights based on trends
    if (parseFloat(reachTrend) < -10) {
      strategyRecommendations.insights.push(`⚠️ Reichweite sinkt um ${reachTrend}%. Poste mehr Shareable Content (Carousels, Tipps).`);
    }
    if (parseFloat(reachTrend) > 10) {
      strategyRecommendations.insights.push(`✅ Reichweite steigt um ${reachTrend}%. Weiter so!`);
    }
    if (totalProfileViews < avgReach * 0.05) {
      strategyRecommendations.insights.push(`💡 Profil-Besuche sind niedrig. Füge mehr CTAs in deine Captions ein.`);
    }
    if (bestFormat === 'carousel') {
      strategyRecommendations.insights.push(`📊 Carousels performen besser. Erstelle mehr davon.`);
    }
    if (followerGrowth < 0) {
      strategyRecommendations.insights.push(`📉 Follower-Verlust. Fokussiere auf Community-Building und Interaktion.`);
    }
  }

  return {
    period: {
      start: start_date,
      end: endDateStr,
      days_tracked: stats.length
    },
    follower_growth: {
      start_count: firstDay.follower_count,
      end_count: lastDay.follower_count,
      absolute_change: followerGrowth,
      percent_change: `${followerGrowthPercent}%`,
      trend: followerGrowth > 0 ? '📈 Wachstum' : followerGrowth < 0 ? '📉 Rückgang' : '➡️ Stabil'
    },
    reach_analysis: {
      total_reach: totalReach,
      avg_daily_reach: avgReach,
      trend: `${reachTrend}%`,
      trend_label: parseFloat(reachTrend) > 0 ? '📈 Steigend' : parseFloat(reachTrend) < 0 ? '📉 Sinkend' : '➡️ Stabil'
    },
    impressions_analysis: {
      total_impressions: totalImpressions,
      avg_daily_impressions: avgImpressions,
      trend: `${impressionsTrend}%`
    },
    engagement: {
      total_profile_views: totalProfileViews,
      total_website_clicks: totalWebsiteClicks,
      conversion_rate: totalReach > 0 ? `${((totalProfileViews / totalReach) * 100).toFixed(2)}%` : 'N/A'
    },
    strategy: strategyRecommendations
  };
}

// Tool: Trigger manual insights tracking
async function executeTriggerInsightsTracking(supabase: any, userId: string, authToken: string) {
  console.log(`[copilot] Triggering insights tracking for user ${userId}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/fetch-daily-insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { 
        error: `Tracking fehlgeschlagen: ${errorData.error || 'Unbekannter Fehler'}`,
        suggestion: 'Stelle sicher, dass dein Instagram-Account verbunden ist.'
      };
    }

    const result = await response.json();
    return {
      success: true,
      message: 'Tägliche Insights wurden erfolgreich getrackt!',
      data: result.stats || result
    };
  } catch (err) {
    console.error('[copilot] Trigger tracking error:', err);
    return { 
      error: `Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}` 
    };
  }
}

// Tool: Analyze Content Categories - Uses AI classification data
async function executeAnalyzeContentCategories(supabase: any, userId: string, params: any) {
  const { group_by, metric, time_period = 'all_time', include_recommendations = true } = params;

  console.log(`[copilot] Analyzing content categories by ${group_by}, metric: ${metric}`);

  // Build date filter
  let dateFilter = '';
  const now = new Date();
  if (time_period === 'last_month') {
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    dateFilter = monthAgo.toISOString();
  } else if (time_period === 'last_3_months') {
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    dateFilter = threeMonthsAgo.toISOString();
  }

  // Get all classified posts
  let query = supabase
    .from('posts')
    .select('id, category, mood, topic_tags, likes_count, comments_count, saved_count, reach_count, engagement_rate, published_at')
    .eq('user_id', userId)
    .eq('status', 'PUBLISHED')
    .eq('is_imported', true);

  if (dateFilter) {
    query = query.gte('published_at', dateFilter);
  }

  const { data: posts, error } = await query;

  if (error) {
    console.error('[copilot] Category analysis error:', error);
    return { error: 'Fehler beim Laden der Posts' };
  }

  if (!posts || posts.length === 0) {
    return { 
      error: 'Keine Posts gefunden',
      suggestion: 'Importiere zuerst Posts von Instagram'
    };
  }

  // Check how many are classified
  const classifiedPosts = posts.filter((p: any) => p.category);
  const unclassifiedCount = posts.length - classifiedPosts.length;

  if (classifiedPosts.length === 0) {
    return {
      error: 'Keine klassifizierten Posts gefunden',
      total_posts: posts.length,
      unclassified_count: unclassifiedCount,
      suggestion: 'Sage "Klassifiziere meine Posts" um die AI-Analyse zu starten'
    };
  }

  // Calculate metrics by group
  const groups: Record<string, any[]> = {};

  if (group_by === 'topic_tags') {
    // Flatten topic tags
    for (const post of classifiedPosts) {
      const tags = post.topic_tags || [];
      for (const tag of tags) {
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(post);
      }
    }
  } else {
    // Group by category or mood
    for (const post of classifiedPosts) {
      const key = post[group_by] || 'Unbekannt';
      if (!groups[key]) groups[key] = [];
      groups[key].push(post);
    }
  }

  // Calculate stats for each group
  const groupStats = Object.entries(groups).map(([name, groupPosts]) => {
    const totalLikes = groupPosts.reduce((sum, p) => sum + (p.likes_count || 0), 0);
    const totalComments = groupPosts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
    const totalSaves = groupPosts.reduce((sum, p) => sum + (p.saved_count || 0), 0);
    const totalReach = groupPosts.reduce((sum, p) => sum + (p.reach_count || 0), 0);
    const avgEngagement = groupPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / groupPosts.length;

    let metricValue = 0;
    let metricLabel = '';
    
    switch (metric) {
      case 'engagement':
        metricValue = totalLikes + totalComments + totalSaves;
        metricLabel = 'Total Engagement';
        break;
      case 'reach':
        metricValue = totalReach;
        metricLabel = 'Total Reach';
        break;
      case 'engagement_rate':
        metricValue = avgEngagement;
        metricLabel = 'Avg Engagement Rate';
        break;
    }

    return {
      name,
      post_count: groupPosts.length,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_saves: totalSaves,
      total_reach: totalReach,
      avg_engagement_rate: Math.round(avgEngagement * 100) / 100,
      metric_value: Math.round(metricValue * 100) / 100,
      metric_label: metricLabel,
      avg_per_post: groupPosts.length > 0 ? Math.round(metricValue / groupPosts.length) : 0
    };
  });

  // Sort by metric value descending
  groupStats.sort((a, b) => b.metric_value - a.metric_value);

  // Generate recommendations
  let recommendations: string[] = [];
  if (include_recommendations && groupStats.length >= 2) {
    const best = groupStats[0];
    const worst = groupStats[groupStats.length - 1];

    recommendations = [
      `🏆 "${best.name}" performt am besten mit ${best.metric_value.toLocaleString()} ${best.metric_label} (${best.post_count} Posts)`,
      `📉 "${worst.name}" hat den niedrigsten Wert: ${worst.metric_value.toLocaleString()} ${worst.metric_label}`,
    ];

    if (metric === 'engagement_rate' && best.avg_engagement_rate > 3) {
      recommendations.push(`💡 "${best.name}"-Posts haben exzellente Engagement-Rates (${best.avg_engagement_rate}%). Mehr davon!`);
    }

    if (best.total_saves > best.total_likes * 0.1) {
      recommendations.push(`📌 "${best.name}"-Posts werden oft gespeichert - das zeigt hohen Mehrwert!`);
    }
  }

  return {
    analysis_type: group_by,
    metric_used: metric,
    time_period,
    total_posts_analyzed: classifiedPosts.length,
    unclassified_posts: unclassifiedCount,
    groups: groupStats.slice(0, 10), // Top 10
    recommendations,
    best_performer: groupStats[0],
    worst_performer: groupStats[groupStats.length - 1]
  };
}

// Tool: Trigger batch classification
async function executeClassifyPostsBatch(supabase: any, userId: string, authToken: string, params: any) {
  const { limit = 10 } = params;
  const actualLimit = Math.min(limit, 20);

  console.log(`[copilot] Triggering batch classification for ${actualLimit} posts`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/classify-post-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ batch_mode: true, limit: actualLimit })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { 
        error: `Klassifizierung fehlgeschlagen: ${errorData.error || 'Unbekannter Fehler'}`
      };
    }

    const result = await response.json();
    return {
      success: true,
      message: `${result.classified}/${result.total} Posts erfolgreich klassifiziert!`,
      classified: result.classified,
      total_processed: result.total,
      errors: result.errors || 0
    };
  } catch (err) {
    console.error('[copilot] Batch classification error:', err);
    return { 
      error: `Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}` 
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    const user = authData?.user;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      throw new Error("messages array required");
    }

    console.log(`[copilot] Processing chat for user ${user.id}, ${messages.length} messages`);

    // Get brand rules for context
    const { data: brandRules } = await supabase
      .from('brand_rules')
      .select('tone_style, writing_style, language_primary, formality_mode')
      .eq('user_id', user.id)
      .maybeSingle();

    // System prompt for the agent with full database schema knowledge
    const systemPrompt = `Du bist Antoine's Community Co-Pilot, ein intelligenter Daten-Analyst und Stratege für Social Media Management.

DU HAST VOLLSTÄNDIGEN ZUGRIFF AUF DIE DATENBANK:

📊 TABELLEN-SCHEMA:
1. posts: id, caption, published_at, likes_count, comments_count, saved_count, reach_count, impressions_count, engagement_rate, category, mood, topic_tags, status, format
2. instagram_comments: id, comment_text, commenter_username, sentiment_score, is_critical, is_replied
3. topics: id, title, description, priority, evergreen
4. brand_rules: tone_style, writing_style, formality_mode
5. daily_account_stats: date, follower_count, impressions_day, reach_day, profile_views, website_clicks (HISTORISCHE DATEN!)

🏷️ CONTENT CLASSIFICATION (AI-generiert):
- category: Humor, Behind the Scenes, Promo, Inspiration, Privates, News, Tutorial, Entertainment
- mood: Fröhlich, Sarkastisch, Ernst, Nachdenklich, Aufgeregt, Entspannt, Provokant, Nostalgisch
- topic_tags: Array mit 3-5 Themen-Tags pro Post

DEINE TOOLS:
- search_posts: Suche nach Posts/Stichworten
- analyze_sentiment: Stimmung eines Posts
- draft_reply: Antwort-Entwurf erstellen
- get_open_comments: Offene Kommentare finden
- analyze_data: Post-Statistiken & Engagement
- get_account_summary: Gesamtübersicht
- analyze_growth: 📈 WACHSTUMS-ANALYSE mit historischen Follower/Reach-Daten!
- trigger_insights_tracking: Manuell Insights tracken
- analyze_content_categories: 🏷️ KATEGORIE-ANALYSE! Welche Kategorie/Stimmung/Thema performt am besten?
- classify_posts_batch: 🤖 AI-Klassifizierung für unklassifizierte Posts starten

⚠️ KRITISCHE REGELN:
1. Bei "Warum stagniert...", "Wachstum", "Reichweite sinkt" → NUTZE analyze_growth!
2. Bei "Welche Kategorie...", "Was bringt Reichweite", "Welche Themen" → NUTZE analyze_content_categories!
3. Bei "Klassifiziere", "Tagge Posts", "Analysiere Inhalte" → NUTZE classify_posts_batch!
4. analyze_growth hat ECHTE historische Daten aus daily_account_stats
5. Sage NIEMALS "Ich habe keinen Zugriff" - du HAST Zugriff!
6. Wenn keine klassifizierten Posts: Schlage "Klassifiziere meine Posts" vor

STRATEGIE-MODUS:
Bei Content-Strategie-Fragen:
1. Nutze analyze_content_categories mit dem richtigen group_by (category/mood/topic_tags)
2. Vergleiche Performance nach engagement, reach oder engagement_rate
3. Identifiziere Best-Performer und gib konkrete Empfehlungen
4. Beispiel: "Deine Humor-Posts haben 3x mehr Reach als Promo-Posts!"

KONTEXT:
- Sprache: ${brandRules?.language_primary || 'Deutsch'}
- Tonalität: ${brandRules?.tone_style || 'locker und authentisch'}

BEISPIELE:
User: "Welche Kategorie bringt am meisten Reichweite?"
→ analyze_content_categories(group_by="category", metric="reach")
→ "Deine Humor-Posts haben durchschnittlich 45.000 Reach, während Promo-Posts nur 12.000 erreichen!"

User: "Klassifiziere meine Posts"
→ classify_posts_batch(limit=10)
→ "10 Posts wurden mit AI analysiert und klassifiziert!"

User: "Welche Themen laufen gut?"
→ analyze_content_categories(group_by="topic_tags", metric="engagement")`;

    // First call: Let the AI decide if it needs tools
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        tools: TOOLS,
        tool_choice: 'auto'
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[copilot] AI error:', errorText);
      throw new Error('AI request failed');
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices?.[0]?.message;

    if (!assistantMessage) {
      throw new Error('No response from AI');
    }

    // Check if the AI wants to use tools
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`[copilot] AI requested ${assistantMessage.tool_calls.length} tool calls`);
      
      const toolResults: any[] = [];
      
      for (const toolCall of assistantMessage.tool_calls) {
        const funcName = toolCall.function.name;
        const params = JSON.parse(toolCall.function.arguments || '{}');
        
        console.log(`[copilot] Executing tool: ${funcName}`, params);
        
        let result;
        switch (funcName) {
          case 'search_posts':
            result = await executeSearchPosts(supabase, user.id, params);
            break;
          case 'analyze_sentiment':
            result = await executeAnalyzeSentiment(supabase, user.id, params);
            break;
          case 'draft_reply':
            result = await executeDraftReply(supabase, user.id, params, brandRules);
            break;
          case 'get_open_comments':
            result = await executeGetOpenComments(supabase, user.id, params);
            break;
          case 'analyze_data':
            result = await executeAnalyzeData(supabase, user.id, params);
            break;
          case 'get_account_summary':
            result = await executeGetAccountSummary(supabase, user.id, params);
            break;
          case 'analyze_growth':
            result = await executeAnalyzeGrowth(supabase, user.id, params);
            break;
          case 'trigger_insights_tracking':
            result = await executeTriggerInsightsTracking(supabase, user.id, authHeader.replace("Bearer ", ""));
            break;
          case 'analyze_content_categories':
            result = await executeAnalyzeContentCategories(supabase, user.id, params);
            break;
          case 'classify_posts_batch':
            result = await executeClassifyPostsBatch(supabase, user.id, authHeader.replace("Bearer ", ""), params);
            break;
          default:
            result = { error: `Unknown tool: ${funcName}` };
        }
        
        toolResults.push({
          tool_call_id: toolCall.id,
          function_name: funcName,
          result
        });
      }

      // Second call: Let AI summarize the results
      const followUpMessages = [
        { role: 'system', content: systemPrompt },
        ...messages,
        assistantMessage,
        ...toolResults.map(tr => ({
          role: 'tool',
          tool_call_id: tr.tool_call_id,
          content: JSON.stringify(tr.result)
        }))
      ];

      const followUpResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: followUpMessages
        }),
      });

      if (!followUpResponse.ok) {
        throw new Error('Follow-up AI request failed');
      }

      const followUpData = await followUpResponse.json();
      const finalMessage = followUpData.choices?.[0]?.message?.content || 'Ich konnte die Anfrage nicht verarbeiten.';

      return new Response(JSON.stringify({
        message: finalMessage,
        tool_results: toolResults.map(tr => ({
          function_name: tr.function_name,
          result: tr.result
        }))
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No tool calls, just return the text response
    return new Response(JSON.stringify({
      message: assistantMessage.content || 'Ich verstehe dich nicht ganz. Kannst du das genauer beschreiben?',
      tool_results: []
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[copilot] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
