import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
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
  },
  {
    type: "function",
    function: {
      name: "generate_personalized_image",
      description: "Erstellt ein personalisiertes, urheberrechtsfreies Bild im Stil eines Themas (z.B. 'Matrix', 'Sci-Fi', 'Western') mit dem Gesicht des Users. NUTZE DIES wenn der User 'Erstelle ein Bild von mir als...', 'Mach ein Foto im Matrix-Stil', 'Generiere ein Bild zu diesem Zitat' sagt.",
      parameters: {
        type: "object",
        properties: {
          theme: {
            type: "string",
            description: "Das Thema/der Stil für das Bild (z.B. 'Matrix', 'Sci-Fi Neon', '80er Jahre', 'Western', 'Noir', 'Space')"
          },
          user_pose_description: {
            type: "string",
            description: "Beschreibung der Pose/Aktion (z.B. 'schaue skeptisch auf einen leuchtenden Würfel', 'stehe cool mit Sonnenbrille', 'zeige dramatisch auf etwas')"
          },
          reference_image_id: {
            type: "string",
            description: "Die ID eines Fotos aus der media_assets Bibliothek (optional - wird automatisch das beste Selfie gewählt wenn leer)"
          }
        },
        required: ["theme", "user_pose_description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_best_time",
      description: "Analysiert die posts-Tabelle (Insights), um die besten Wochentage und Uhrzeiten für Posts zu finden. NUTZE DIES bei Fragen wie 'Wann soll ich posten?', 'Bester Posting-Zeitpunkt?', 'Welcher Wochentag ist am besten?'",
      parameters: {
        type: "object",
        properties: {
          time_period: {
            type: "string",
            description: "Analysezeitraum: 'last_month', 'last_3_months', 'last_6_months', 'all_time'",
            enum: ["last_month", "last_3_months", "last_6_months", "all_time"]
          },
          metric: {
            type: "string",
            description: "Metrik zur Optimierung: 'engagement' (Likes+Comments), 'reach' (Reichweite), 'engagement_rate'",
            enum: ["engagement", "reach", "engagement_rate"]
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "plan_post",
      description: "Erstellt einen Entwurf im content_plan. NUTZE DIES am Ende eines mehrstufigen Kampagnen-Workflows, wenn du Bild, Text und Zeitpunkt hast. Der User sieht dann eine interaktive Karte mit Genehmigen/Ablehnen-Buttons.",
      parameters: {
        type: "object",
        properties: {
          caption: {
            type: "string",
            description: "Die Caption für den Post"
          },
          image_url: {
            type: "string",
            description: "URL des generierten oder gewählten Bildes"
          },
          scheduled_for: {
            type: "string",
            description: "Geplantes Posting-Datum (ISO 8601 Format, z.B. '2024-01-15T18:00:00Z')"
          },
          concept_note: {
            type: "string",
            description: "Interne Notiz zur Idee (z.B. 'Filmzitat Godfather für ältere Zielgruppe')"
          },
          content_type: {
            type: "string",
            description: "Format: 'single' oder 'carousel'",
            enum: ["single", "carousel"]
          }
        },
        required: ["caption", "image_url", "scheduled_for"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_user_photos",
      description: "Holt Fotos aus der User-Bibliothek (media_assets) mit KI-Analyse. Bilder werden automatisch von der KI getaggt und bewertet. NUTZE DIES um ein passendes Referenzfoto für die Bildgenerierung zu finden.",
      parameters: {
        type: "object",
        properties: {
          only_selfies: {
            type: "boolean",
            description: "Nur Selfies (Bilder mit is_selfie=true)"
          },
          only_reference: {
            type: "boolean",
            description: "Nur von der KI als 'gute Referenz' bewertete Fotos (is_good_reference=true) - automatisch erkannt, keine manuelle Markierung nötig"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter nach Tags - sucht in manuellen UND KI-generierten Tags (z.B. ['ernst', 'professionell', 'outdoor'])"
          },
          mood_filter: {
            type: "string",
            description: "Filter nach Stimmung aus der KI-Analyse (z.B. 'ernst', 'fröhlich', 'nachdenklich', 'cool', 'dramatisch')"
          },
          limit: {
            type: "number",
            description: "Maximale Anzahl (Standard: 10)"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_parody_image",
      description: "Erstellt ein DALL-E 3 Parodie-Bild im Stil eines Films/Themas. NUTZE DIES wenn der User 'Mach ein Bild im Stil von Der Pate/Matrix/Casablanca', 'Film-Noir Foto', 'Erstelle eine Parodie' sagt. Das Bild zeigt Antoine als Look-alike, KEINE echten Schauspieler, KEINE Copyright-Elemente.",
      parameters: {
        type: "object",
        properties: {
          style: {
            type: "string",
            description: "Der visuelle Stil (z.B. 'Film Noir, 1940er, schwarz-weiß', 'Cyberpunk Neon', '70er Jahre Mafia-Drama')"
          },
          scene_description: {
            type: "string",
            description: "Beschreibung der Szene (z.B. 'Ein Detektiv sitzt im verrauchten Büro', 'Ein Mann steht auf einem Balkon und schaut über die Stadt')"
          },
          ref_image_url: {
            type: "string",
            description: "URL eines Referenzfotos von Antoine aus der media_assets Bibliothek"
          }
        },
        required: ["style", "scene_description", "ref_image_url"]
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
        error: 'Keine Daten für diesen Zeitraum gefunden',
        suggestion: 'Aktiviere das tägliche Insights-Tracking für präzise Wachstumsanalysen.',
        hint: 'Sage "Tracke meine Insights" um das Tracking zu starten.'
      };
    }

    // Calculate engagement-based proxy metrics
    const totalLikes = posts.reduce((sum: number, p: any) => sum + (p.likes_count || 0), 0);
    const totalComments = posts.reduce((sum: number, p: any) => sum + (p.comments_count || 0), 0);
    const totalImpressions = posts.reduce((sum: number, p: any) => sum + (p.impressions_count || 0), 0);

    return {
      period: { start: start_date, end: endDateStr, days_tracked: 0 },
      fallback_mode: true,
      engagement_proxy: {
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

// Tool: Generate personalized image
async function executeGeneratePersonalizedImage(supabase: any, userId: string, params: any) {
  const { theme, user_pose_description, reference_image_id } = params;

  console.log(`[copilot] Generating personalized image: theme="${theme}", pose="${user_pose_description}"`);

  try {
    // Get reference image - either specified or find best selfie
    let referenceImageUrl: string | null = null;

    if (reference_image_id) {
      const { data: asset } = await supabase
        .from('media_assets')
        .select('public_url')
        .eq('id', reference_image_id)
        .eq('user_id', userId)
        .single();
      
      referenceImageUrl = asset?.public_url;
    } else {
      // Find best selfie from user's media library
      const { data: selfies } = await supabase
        .from('media_assets')
        .select('public_url')
        .eq('user_id', userId)
        .eq('is_selfie', true)
        .eq('ai_usable', true)
        .order('created_at', { ascending: false })
        .limit(1);
      
      referenceImageUrl = selfies?.[0]?.public_url;
    }

    if (!referenceImageUrl) {
      return {
        error: 'Kein Referenzbild gefunden',
        suggestion: 'Bitte lade zuerst ein Foto von dir unter "Meine Fotos" hoch und markiere es als "Ich bin auf dem Bild".'
      };
    }

    // Call the image generation function
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-personalized-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        theme,
        user_pose_description,
        reference_image_url: referenceImageUrl,
        user_id: userId
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[copilot] Image generation error:', errorData);
      return {
        error: `Bildgenerierung fehlgeschlagen: ${errorData.error || 'Unbekannter Fehler'}`
      };
    }

    const result = await response.json();
    
    return {
      success: true,
      image_url: result.image_url,
      prompt_used: result.prompt_used,
      theme: result.theme,
      safety_note: result.safety_note,
      message: `🎬 Bild erfolgreich generiert! Thema: "${theme}", Pose: "${user_pose_description}"`
    };
  } catch (err) {
    console.error('[copilot] Personalized image error:', err);
    return { 
      error: `Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}` 
    };
  }
}

// Tool: Analyze best posting time
async function executeAnalyzeBestTime(supabase: any, userId: string, params: any) {
  const { time_period = 'last_3_months', metric = 'engagement' } = params;

  console.log(`[copilot] Analyzing best posting time, period: ${time_period}, metric: ${metric}`);

  // Build date filter
  const now = new Date();
  let dateFilter: string | null = null;
  
  switch (time_period) {
    case 'last_month':
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = monthAgo.toISOString();
      break;
    case 'last_3_months':
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      dateFilter = threeMonthsAgo.toISOString();
      break;
    case 'last_6_months':
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      dateFilter = sixMonthsAgo.toISOString();
      break;
    case 'all_time':
    default:
      dateFilter = null;
  }

  // Get published posts with engagement data
  let query = supabase
    .from('posts')
    .select('id, published_at, likes_count, comments_count, saved_count, reach_count, engagement_rate')
    .eq('user_id', userId)
    .eq('status', 'PUBLISHED')
    .not('published_at', 'is', null);

  if (dateFilter) {
    query = query.gte('published_at', dateFilter);
  }

  const { data: posts, error } = await query;

  if (error) {
    console.error('[copilot] Best time analysis error:', error);
    return { error: 'Fehler beim Laden der Posts' };
  }

  if (!posts || posts.length === 0) {
    return {
      error: 'Keine veröffentlichten Posts gefunden',
      suggestion: 'Importiere zuerst Posts von Instagram'
    };
  }

  // Analyze by day of week
  const dayStats: Record<string, { posts: number; engagement: number; reach: number; rate: number }> = {};
  const hourStats: Record<number, { posts: number; engagement: number; reach: number; rate: number }> = {};
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  for (const post of posts) {
    const publishedAt = new Date(post.published_at);
    const dayOfWeek = dayNames[publishedAt.getDay()];
    const hour = publishedAt.getHours();

    const engagement = (post.likes_count || 0) + (post.comments_count || 0) + (post.saved_count || 0);
    const reach = post.reach_count || 0;
    const engagementRate = post.engagement_rate || 0;

    // Day stats
    if (!dayStats[dayOfWeek]) {
      dayStats[dayOfWeek] = { posts: 0, engagement: 0, reach: 0, rate: 0 };
    }
    dayStats[dayOfWeek].posts++;
    dayStats[dayOfWeek].engagement += engagement;
    dayStats[dayOfWeek].reach += reach;
    dayStats[dayOfWeek].rate += engagementRate;

    // Hour stats
    if (!hourStats[hour]) {
      hourStats[hour] = { posts: 0, engagement: 0, reach: 0, rate: 0 };
    }
    hourStats[hour].posts++;
    hourStats[hour].engagement += engagement;
    hourStats[hour].reach += reach;
    hourStats[hour].rate += engagementRate;
  }

  // Calculate averages and sort
  const dayRanking = Object.entries(dayStats)
    .map(([day, stats]) => ({
      day,
      posts: stats.posts,
      avg_engagement: stats.posts > 0 ? Math.round(stats.engagement / stats.posts) : 0,
      avg_reach: stats.posts > 0 ? Math.round(stats.reach / stats.posts) : 0,
      avg_rate: stats.posts > 0 ? Math.round((stats.rate / stats.posts) * 100) / 100 : 0
    }))
    .sort((a, b) => {
      if (metric === 'reach') return b.avg_reach - a.avg_reach;
      if (metric === 'engagement_rate') return b.avg_rate - a.avg_rate;
      return b.avg_engagement - a.avg_engagement;
    });

  const hourRanking = Object.entries(hourStats)
    .map(([hour, stats]) => ({
      hour: parseInt(hour),
      hour_label: `${hour.toString().padStart(2, '0')}:00`,
      posts: stats.posts,
      avg_engagement: stats.posts > 0 ? Math.round(stats.engagement / stats.posts) : 0,
      avg_reach: stats.posts > 0 ? Math.round(stats.reach / stats.posts) : 0,
      avg_rate: stats.posts > 0 ? Math.round((stats.rate / stats.posts) * 100) / 100 : 0
    }))
    .filter(h => h.posts >= 2) // Only consider hours with at least 2 posts
    .sort((a, b) => {
      if (metric === 'reach') return b.avg_reach - a.avg_reach;
      if (metric === 'engagement_rate') return b.avg_rate - a.avg_rate;
      return b.avg_engagement - a.avg_engagement;
    });

  const bestDay = dayRanking[0];
  const worstDay = dayRanking[dayRanking.length - 1];
  const bestHour = hourRanking[0];

  // Generate optimal posting slot
  const optimalSlot = bestDay && bestHour ? {
    day: bestDay.day,
    hour: bestHour.hour,
    formatted: `${bestDay.day}, ${bestHour.hour_label} Uhr`,
    confidence: posts.length >= 20 ? 'hoch' : posts.length >= 10 ? 'mittel' : 'niedrig'
  } : null;

  return {
    period_analyzed: time_period,
    total_posts_analyzed: posts.length,
    metric_used: metric,
    optimal_posting_slot: optimalSlot,
    day_ranking: dayRanking.slice(0, 5),
    best_day: bestDay,
    worst_day: worstDay,
    hour_ranking: hourRanking.slice(0, 5),
    best_hour: bestHour,
    recommendations: [
      `🎯 Bester Tag: ${bestDay?.day || 'N/A'} (durchschn. ${bestDay?.avg_engagement || 0} Engagement)`,
      `⏰ Beste Uhrzeit: ${bestHour?.hour_label || 'N/A'} Uhr (${bestHour?.posts || 0} Posts analysiert)`,
      `📅 Optimaler Slot: ${optimalSlot?.formatted || 'Noch nicht genug Daten'}`,
      worstDay ? `⚠️ Vermeide: ${worstDay.day} (${worstDay.avg_engagement} Engagement)` : null
    ].filter(Boolean)
  };
}

// Tool: Plan post (create content_plan entry)
async function executePlanPost(supabase: any, userId: string, params: any) {
  const { caption, image_url, scheduled_for, concept_note, content_type = 'single' } = params;

  console.log(`[copilot] Creating content plan entry for ${scheduled_for}`);

  if (!caption || !image_url || !scheduled_for) {
    return {
      error: 'Fehlende Parameter: caption, image_url und scheduled_for sind erforderlich'
    };
  }

  try {
    // Parse and validate scheduled date
    const scheduledDate = new Date(scheduled_for);
    if (isNaN(scheduledDate.getTime())) {
      return { error: 'Ungültiges Datum für scheduled_for' };
    }

    // Create content plan entry
    const { data: plan, error } = await supabase
      .from('content_plan')
      .insert({
        user_id: userId,
        status: 'draft',
        scheduled_for: scheduledDate.toISOString(),
        concept_note: concept_note || null,
        content_type,
        generated_caption: caption,
        generated_image_url: image_url,
        ai_model_used: 'copilot-orchestrator'
      })
      .select()
      .single();

    if (error) {
      console.error('[copilot] Plan post error:', error);
      return { error: 'Fehler beim Erstellen des Entwurfs' };
    }

    // Format date nicely for German locale
    const formattedDate = scheduledDate.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });

    return {
      success: true,
      draft_id: plan.id,
      draft_data: {
        id: plan.id,
        caption,
        image_url,
        scheduled_for: scheduledDate.toISOString(),
        scheduled_for_formatted: formattedDate,
        concept_note,
        content_type,
        status: 'draft'
      },
      message: `✅ Entwurf erstellt für ${formattedDate}`,
      actions_available: ['approve', 'regenerate_image', 'edit_caption']
    };
  } catch (err) {
    console.error('[copilot] Plan post error:', err);
    return { 
      error: `Fehler: ${err instanceof Error ? err.message : 'Unbekannt'}` 
    };
  }
}

// Tool: Get user photos from media library (with AI analysis support)
async function executeGetUserPhotos(supabase: any, userId: string, params: any) {
  const { only_selfies = false, only_reference = false, tags, mood_filter, limit = 10 } = params;

  console.log(`[copilot] Getting user photos, selfies_only: ${only_selfies}, reference_only: ${only_reference}, tags: ${JSON.stringify(tags)}, mood: ${mood_filter}`);

  // Base query - include AI analysis fields
  let query = supabase
    .from('media_assets')
    .select('id, public_url, description, tags, mood, is_selfie, is_reference, ai_usable, created_at, ai_tags, ai_description, analyzed, is_good_reference')
    .eq('user_id', userId)
    .eq('ai_usable', true)
    .order('created_at', { ascending: false });

  if (only_selfies) {
    query = query.eq('is_selfie', true);
  }

  // Use is_good_reference from AI analysis instead of manual is_reference
  if (only_reference) {
    query = query.eq('is_good_reference', true);
  }

  const { data: photos, error } = await query.limit(limit * 2); // Get more to filter

  if (error) {
    console.error('[copilot] Get user photos error:', error);
    return { error: 'Fehler beim Laden der Fotos' };
  }

  if (!photos || photos.length === 0) {
    return {
      error: only_reference ? 'Keine Referenz-Fotos gefunden' : 'Keine Fotos gefunden',
      suggestion: 'Lade Fotos unter "Meine Bilder" hoch und starte die KI-Analyse.'
    };
  }

  // Filter by tags (check both manual tags and AI tags)
  let filteredPhotos = photos;
  let usedFallback = false;
  let searchedTags: string[] = [];

  if (tags && Array.isArray(tags) && tags.length > 0) {
    searchedTags = tags.map((t: string) => t.toLowerCase());
    
    filteredPhotos = photos.filter((p: any) => {
      const manualTags = (p.tags || []).map((t: string) => t.toLowerCase());
      const aiTags = (p.ai_tags || []).map((t: string) => t.toLowerCase());
      const allTags = [...manualTags, ...aiTags];
      
      // Also check AI description for semantic matching
      const description = (p.ai_description || '').toLowerCase();
      
      return searchedTags.some((tag: string) => 
        allTags.includes(tag) || 
        allTags.some(t => t.includes(tag) || tag.includes(t)) ||
        description.includes(tag)
      );
    });

    // FALLBACK LOGIC: If tag filter returns 0 results, use AI-analyzed good references
    if (filteredPhotos.length === 0) {
      console.log(`[copilot] No photos found with tags [${tags.join(', ')}], falling back to good references`);
      
      // Get all AI-analyzed good references as fallback
      const goodRefs = photos.filter((p: any) => p.is_good_reference === true);
      
      if (goodRefs.length > 0) {
        filteredPhotos = goodRefs;
        usedFallback = true;
      } else {
        // Last resort: just use any analyzed photos
        const analyzedPhotos = photos.filter((p: any) => p.analyzed === true);
        filteredPhotos = analyzedPhotos.length > 0 ? analyzedPhotos : photos;
        usedFallback = true;
      }
    }
  }

  // If mood_filter specified, also try to match
  if (mood_filter && filteredPhotos.length > 0) {
    const moodLower = mood_filter.toLowerCase();
    const moodMatches = filteredPhotos.filter((p: any) => {
      const aiTags = (p.ai_tags || []).map((t: string) => t.toLowerCase());
      const description = (p.ai_description || '').toLowerCase();
      return aiTags.includes(moodLower) || description.includes(moodLower);
    });
    
    if (moodMatches.length > 0) {
      filteredPhotos = moodMatches;
    }
  }

  // Limit results
  filteredPhotos = filteredPhotos.slice(0, limit);

  const result: any = {
    total: filteredPhotos.length,
    photos: filteredPhotos.map((p: any) => ({
      id: p.id,
      url: p.public_url,
      description: p.ai_description || p.description,
      tags: [...(p.tags || []), ...(p.ai_tags || [])],
      mood: p.mood,
      is_selfie: p.is_selfie,
      is_good_reference: p.is_good_reference,
      analyzed: p.analyzed
    })),
    selfie_count: filteredPhotos.filter((p: any) => p.is_selfie).length,
    reference_count: filteredPhotos.filter((p: any) => p.is_good_reference).length,
    analyzed_count: filteredPhotos.filter((p: any) => p.analyzed).length
  };

  // Add warning if fallback was used
  if (usedFallback && searchedTags.length > 0) {
    result.warning = `Keine Fotos mit den Tags [${searchedTags.join(', ')}] gefunden. Zeige stattdessen ${result.reference_count > 0 ? 'beste Referenz-Bilder (von KI analysiert)' : 'alle verfügbaren Bilder'}.`;
    result.fallback_used = true;
  }

  return result;
}

// Tool: Generate DALL-E 3 parody image
// Prompt rewriting strategies for content policy violations
const PROMPT_REWRITE_STRATEGIES = [
  // Level 1: Remove specific references, keep general style
  (style: string, scene: string) => ({
    style: style
      .replace(/\b(Der Pate|Godfather|Scarface|Matrix|Star Wars|Herr der Ringe|Lord of the Rings|Pulp Fiction|James Bond|Batman|Superman|Joker|Avengers|Marvel|DC|Disney|Pixar)\b/gi, '')
      .replace(/\b(Marlon Brando|Al Pacino|Keanu Reeves|Robert De Niro|Leonardo DiCaprio)\b/gi, '')
      .trim() || 'klassisches Drama mit atmosphärischer Beleuchtung',
    scene: scene,
    description: 'Filmreferenzen entfernt, Stil abstrakt formuliert'
  }),
  // Level 2: Abstract to pure visual style
  (style: string, scene: string) => ({
    style: 'Film Noir inspiriert, 1940er Jahre Ästhetik, dramatische Schatten, gedämpfte Farben, Chiaroscuro Beleuchtung',
    scene: scene.replace(/\b(Mafia|Gangster|Killer|Tod|Waffe|Pistole|Gun|Kill|Murder)\b/gi, match => {
      const replacements: Record<string, string> = {
        'Mafia': 'Geschäftsmann',
        'Gangster': 'eleganter Herr',
        'Killer': 'mysteriöser Mann',
        'Tod': 'Drama',
        'Waffe': 'Zeitung',
        'Pistole': 'Kaffeetasse',
        'Gun': 'newspaper',
        'Kill': 'meet',
        'Murder': 'mystery'
      };
      return replacements[match.toLowerCase()] || match;
    }),
    description: 'Auf Film Noir abstrahiert, gewaltfreie Szene'
  }),
  // Level 3: Maximum abstraction - pure art style
  (style: string, scene: string) => ({
    style: 'Ölgemälde im Stil des Expressionismus, düstere aber elegante Stimmung, warme Erdtöne mit dramatischen Akzenten',
    scene: 'Ein nachdenklicher Gentleman in elegantem Anzug, sitzend in einem klassisch eingerichteten Arbeitszimmer, Buch in der Hand, weiches Fensterlicht',
    description: 'Auf kunsthistorischen Stil abstrahiert'
  })
];

async function executeGenerateParodyImage(supabase: any, userId: string, params: any) {
  const { style, scene_description, ref_image_url } = params;
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

  console.log(`[copilot] Generating DALL-E 3 parody image, style: ${style}`);

  if (!openaiApiKey) {
    return {
      error: 'OPENAI_API_KEY ist nicht konfiguriert',
      suggestion: 'Bitte hinterlege den OpenAI API Key in den Edge Function Secrets.'
    };
  }

  if (!style || !scene_description || !ref_image_url) {
    return {
      error: 'Fehlende Parameter: style, scene_description und ref_image_url sind erforderlich'
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const storageSupabase = createClient(supabaseUrl, supabaseKey);

  // Build prompt function
  const buildDallePrompt = (s: string, sc: string) => `Create an artistic illustration in the following style: ${s}. 

The main person should be designed as a LOOK-ALIKE inspired by this reference (but NOT a copy): A middle-aged European man with distinctive features.

Scene: ${sc}

CRITICAL STYLE REQUIREMENTS:
- Style: Caricature/Parody, slightly exaggerated features
- NO real actors or celebrities
- NO copyrighted characters or logos
- NO brand names or trademarked elements
- Original artistic interpretation only
- High quality, cinematic lighting
- Professional composition`;

  // Autonomous retry loop with automatic prompt rewriting
  const MAX_ATTEMPTS = 3;
  const attemptHistory: Array<{attempt: number, style: string, status: string, error?: string}> = [];
  
  let currentStyle = style;
  let currentScene = scene_description;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const dallePrompt = buildDallePrompt(currentStyle, currentScene);
    
    console.log(`[copilot] 🎨 Attempt ${attempt}/${MAX_ATTEMPTS} - Style: "${currentStyle.substring(0, 50)}..."`);
    
    attemptHistory.push({
      attempt,
      style: currentStyle,
      status: 'trying'
    });

    try {
      const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: dallePrompt,
          n: 1,
          size: '1024x1024',
          quality: 'hd',
          style: 'vivid'
        }),
      });

      if (!dalleResponse.ok) {
        const errorData = await dalleResponse.json();
        console.error(`[copilot] DALL-E error on attempt ${attempt}:`, errorData);
        
        // Check for content policy violation
        if (errorData.error?.code === 'content_policy_violation' || 
            errorData.error?.message?.includes('content_policy') ||
            errorData.error?.message?.includes('safety')) {
          
          attemptHistory[attemptHistory.length - 1].status = 'content_policy_violation';
          attemptHistory[attemptHistory.length - 1].error = 'Prompt rejected by content filter';
          
          // If we have more attempts, rewrite the prompt
          if (attempt < MAX_ATTEMPTS) {
            const rewriteStrategy = PROMPT_REWRITE_STRATEGIES[attempt - 1];
            const rewritten = rewriteStrategy(currentStyle, currentScene);
            
            console.log(`[copilot] ⚠️ Content policy violation. Auto-rewriting prompt for attempt ${attempt + 1}`);
            console.log(`[copilot] Rewrite strategy: ${rewritten.description}`);
            
            currentStyle = rewritten.style;
            currentScene = rewritten.scene;
            
            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
        }
        
        // Other error or max attempts reached
        if (attempt === MAX_ATTEMPTS) {
          return {
            error: 'Alle 3 Versuche sind fehlgeschlagen.',
            attempts: attemptHistory,
            suggestion: 'Auch nach automatischem Umschreiben konnte kein Bild generiert werden. Bitte versuche eine komplett andere Beschreibung.',
            last_error: errorData.error?.message || 'Unbekannt'
          };
        }
        
        // For non-content-policy errors, also retry with abstraction
        if (attempt < MAX_ATTEMPTS) {
          const rewriteStrategy = PROMPT_REWRITE_STRATEGIES[attempt - 1];
          const rewritten = rewriteStrategy(currentStyle, currentScene);
          currentStyle = rewritten.style;
          currentScene = rewritten.scene;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }

      // Success!
      const dalleData = await dalleResponse.json();
      const generatedImageUrl = dalleData.data?.[0]?.url;
      const revisedPrompt = dalleData.data?.[0]?.revised_prompt;

      if (!generatedImageUrl) {
        attemptHistory[attemptHistory.length - 1].status = 'no_image';
        attemptHistory[attemptHistory.length - 1].error = 'No image in response';
        
        if (attempt < MAX_ATTEMPTS) {
          const rewriteStrategy = PROMPT_REWRITE_STRATEGIES[attempt - 1];
          const rewritten = rewriteStrategy(currentStyle, currentScene);
          currentStyle = rewritten.style;
          currentScene = rewritten.scene;
          continue;
        }
        return { error: 'Kein Bild von DALL-E erhalten nach allen Versuchen' };
      }

      attemptHistory[attemptHistory.length - 1].status = 'success';
      console.log(`[copilot] ✅ Success on attempt ${attempt}!`);

      // Download and store the image
      const imageResponse = await fetch(generatedImageUrl);
      const imageBlob = await imageResponse.blob();
      const imageBuffer = await imageBlob.arrayBuffer();
      
      const timestamp = Date.now();
      const storagePath = `${userId}/parody-${timestamp}.png`;

      const { error: uploadError } = await storageSupabase.storage
        .from('post-assets')
        .upload(storagePath, imageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (uploadError) {
        console.error('[copilot] Storage upload error:', uploadError);
        return {
          success: true,
          image_url: generatedImageUrl,
          storage_path: null,
          prompt_used: dallePrompt,
          revised_prompt: revisedPrompt,
          final_style: currentStyle,
          attempts_needed: attempt,
          attempt_history: attemptHistory,
          warning: 'Bild konnte nicht permanent gespeichert werden (temporäre URL gültig für 1h)',
          message: `🎬 Bild erstellt! ${attempt > 1 ? `(${attempt}. Versuch mit angepasstem Stil)` : ''}`
        };
      }

      // Get public URL
      const { data: publicUrlData } = storageSupabase.storage
        .from('post-assets')
        .getPublicUrl(storagePath);

      const finalImageUrl = publicUrlData?.publicUrl || generatedImageUrl;

      return {
        success: true,
        image_url: finalImageUrl,
        storage_path: storagePath,
        prompt_used: dallePrompt,
        revised_prompt: revisedPrompt,
        original_style: style,
        final_style: currentStyle,
        attempts_needed: attempt,
        attempt_history: attemptHistory,
        reference_used: ref_image_url,
        message: `🎬 Parodie-Bild erfolgreich erstellt${attempt > 1 ? ` (nach ${attempt} Versuchen mit optimiertem Prompt)` : ''}!`
      };

    } catch (err) {
      console.error(`[copilot] Parody image error on attempt ${attempt}:`, err);
      attemptHistory[attemptHistory.length - 1].status = 'error';
      attemptHistory[attemptHistory.length - 1].error = err instanceof Error ? err.message : 'Unknown';
      
      if (attempt === MAX_ATTEMPTS) {
        return { 
          error: `Alle Versuche fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannt'}`,
          attempts: attemptHistory
        };
      }
      
      // Retry with more abstract prompt
      const rewriteStrategy = PROMPT_REWRITE_STRATEGIES[attempt - 1];
      const rewritten = rewriteStrategy(currentStyle, currentScene);
      currentStyle = rewritten.style;
      currentScene = rewritten.scene;
    }
  }

  return {
    error: 'Maximale Versuche erreicht ohne Erfolg',
    attempts: attemptHistory
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    // Check for required secrets
    if (!supabaseUrl || !supabaseKey) {
      console.error("[copilot] Missing Supabase configuration");
      return new Response(JSON.stringify({ 
        message: "❌ Die Datenbank-Konfiguration fehlt. Bitte prüfe die Supabase-Einstellungen.",
        error: "missing_supabase_config",
        tool_results: []
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (!lovableApiKey) {
      console.error("[copilot] Missing LOVABLE_API_KEY");
      return new Response(JSON.stringify({ 
        message: "❌ Der AI-Schlüssel (LOVABLE_API_KEY) fehlt. Bitte prüfe die Edge Function Secrets.",
        error: "missing_api_key",
        tool_results: []
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
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

    // ORCHESTRATOR System prompt - Proactive Social Media Manager
    const systemPrompt = `Du bist Antoine's KI-Social-Media-Manager. Deine Aufgabe ist es, EIGENSTÄNDIG Kampagnen zu entwickeln und Posts zu planen. Du wartest nicht nur auf Befehle, du machst proaktive Vorschläge.

🎯 DEINE ROLLE:
Du bist kein einfacher Chatbot - du bist ein strategischer Partner, der komplexe Aufgaben SELBSTSTÄNDIG löst.

📊 TABELLEN-SCHEMA:
1. posts: id, caption, published_at, likes_count, comments_count, saved_count, reach_count, impressions_count, engagement_rate, category, mood, topic_tags, status, format
2. instagram_comments: id, comment_text, commenter_username, sentiment_score, is_critical, is_replied
3. topics: id, title, description, priority, evergreen
4. brand_rules: tone_style, writing_style, formality_mode
5. daily_account_stats: date, follower_count, impressions_day, reach_day, profile_views, website_clicks
6. content_plan: id, status, scheduled_for, concept_note, generated_caption, generated_image_url
7. media_assets: id, public_url, description, tags, mood, is_selfie, is_reference, ai_usable (Antoine's Foto-Bibliothek)

🛠️ DEINE TOOLS:
- search_posts: Suche nach Posts
- analyze_sentiment: Stimmung eines Posts
- draft_reply: Antwort-Entwurf erstellen
- get_open_comments: Offene Kommentare finden
- analyze_data: Post-Statistiken
- get_account_summary: Gesamtübersicht
- analyze_growth: 📈 Wachstums-Analyse
- trigger_insights_tracking: Insights tracken
- analyze_content_categories: 🏷️ Welche Kategorie performt am besten?
- classify_posts_batch: 🤖 AI-Klassifizierung starten
- generate_personalized_image: 🎬 Personalisiertes Bild erstellen (Lovable AI)
- generate_parody_image: 🎭 DALL-E 3 Film-Parodie erstellen (Für Film-Stile wie "Der Pate", "Casablanca")
- analyze_best_time: ⏰ Beste Posting-Zeiten finden
- plan_post: 📝 Entwurf in content_plan speichern (für Genehmigung)
- get_user_photos: 📸 Fotos aus Antoine's Bibliothek holen (mit is_reference Filter für Montage-Fotos)

🚀 MEHRSTUFIGE KAMPAGNEN-WORKFLOWS:

Wenn der User einen komplexen Wunsch äußert (z.B. "Mach mir den Film-Post fertig" oder "Erstelle Content für nächste Woche"), dann:

1️⃣ ANALYSE:
   - Prüfe Engagement-Daten mit analyze_content_categories
   - Finde den besten Zeitpunkt mit analyze_best_time

2️⃣ KONZEPT:
   - Wähle passendes Thema/Zitat basierend auf Performance-Daten
   - Berücksichtige die Zielgruppe

3️⃣ VISUALISIERUNG:
   - Hole Fotos mit get_user_photos (only_reference=true für Montagen, only_selfies=true für Portraits)
   - Für Film-Parodien: generate_parody_image (DALL-E 3, bester Stil)
   - Für andere Themen: generate_personalized_image (Lovable AI)

4️⃣ TEXT:
   - Schreibe Caption passend zum Bild und Thema
   - Berücksichtige Tonalität: ${brandRules?.tone_style || 'locker und authentisch'}

5️⃣ TIMING:
   - Nutze die Ergebnisse von analyze_best_time
   - Plane für den optimalen Zeitpunkt

6️⃣ PRÄSENTATION:
   - Erstelle Entwurf mit plan_post
   - Der User sieht dann eine interaktive Karte mit Genehmigen/Ablehnen Buttons

⚠️ KRITISCHE REGELN:
1. Bei komplexen Aufgaben: Arbeite MEHRSTUFIG und nutze mehrere Tools nacheinander
2. Bei "Film-Post", "Zitat-Post", "Content erstellen" → Starte den vollständigen Workflow
3. Generiere IMMER ein Bild, wenn du einen Post planst
4. Nutze IMMER analyze_best_time vor plan_post
5. Wenn keine Fotos da: Sage dem User er soll welche hochladen
6. Bei generate_personalized_image: Wähle automatisch das beste Selfie
7. Nach plan_post: Sage dem User dass er den Entwurf genehmigen kann

📸 FOTO-SUCHE MIT FALLBACK:
- Wenn der User ein Adjektiv nennt (z.B. "ernst", "lustig", "professionell"), versuche zuerst nach diesem Tag zu filtern
- WICHTIG: Wenn die Tag-Suche KEINE Treffer liefert, nimm IRGENDEIN verfügbares Referenz-Bild
- Der Flow darf NIEMALS mit "Nichts gefunden" abbrechen, wenn es Referenz-Bilder gibt!
- Bei Fallback: Informiere den User kurz ("Kein 'ernstes' Foto gefunden, nutze stattdessen dieses Referenz-Bild")

🚀 AUTOMATISCHE BILDGENERIERUNG - KRITISCH WICHTIG:
- Wenn der User ein generiertes Bild will (z.B. "Erstelle ein Bild", "Mach ein Pate-Bild", "Generiere..."):
  1. Suche SOFORT nach Referenzfotos mit get_user_photos(only_reference=true)
  2. Sobald du ein Foto hast, rufe SOFORT generate_parody_image auf - FRAGE NICHT nach Bestätigung!
  3. Der komplette Flow (Suche → Generierung) muss in EINEM Durchgang passieren
- NIEMALS stoppen und fragen "Soll ich das Bild jetzt generieren?" - TU ES EINFACH!
- Nach erfolgreicher Generierung: Zeige das Bild mit Markdown: ![Beschreibung](URL)

💡 PROAKTIVE VORSCHLÄGE:
- "Ich sehe dass deine Humor-Posts 3x besser performen. Soll ich einen für Donnerstag 18:00 vorbereiten?"
- "Dein letzter Sci-Fi Post hatte 45K Reach. Wie wäre ein Sequel?"
- "Es ist schon 3 Tage her seit deinem letzten Post. Soll ich was planen?"

🎬 CREATIVE IMAGE ENGINES:

1. generate_parody_image (DALL-E 3) - FÜR FILM-PARODIEN:
   - style: Der visuelle Stil ("Film Noir 1940er schwarz-weiß", "70er Mafia-Drama", "Cyberpunk Neon")
   - scene_description: Was passiert ("Ein Detektiv sitzt im verrauchten Büro")
   - ref_image_url: URL eines Referenzfotos (hole mit get_user_photos only_reference=true)
   → Hat autonomen Retry-Modus: Bei Content-Policy-Ablehnung wird der Prompt automatisch 3x umgeschrieben!
   → Du brauchst KEINE Bestätigung vom User - der Agent macht alles selbstständig.

2. generate_personalized_image (Lovable AI) - FÜR ALLGEMEINE THEMEN:
   - theme: Das Thema ("Matrix", "Sci-Fi", "Western")
   - user_pose_description: Was Antoine tut ("steht cool mit Sonnenbrille")
   → Erstellt stilisiertes Bild

🎯 PROMPT ENGINEERING (DEINE GEHEIME SUPERKRAFT):
- Du bist ein Experte für Copyright-sichere Prompts
- Wenn der User urheberrechtlich problematische Referenzen nennt (z.B. "Der Pate", "Matrix", "Star Wars"):
  → Schreibe den Prompt PROAKTIV um, BEVOR du das Tool aufrufst
  → Fange den "Vibe" ein, ohne den geschützten Namen zu nennen
  → Beispiel: "Der Pate" → "70er Jahre Mafia-Drama, gedämpfte Farben, Chiaroscuro Beleuchtung"
  → Beispiel: "Matrix" → "Cyberpunk, grüner Code-Regen, lederig-technischer Look"
- FRAGE NICHT um Erlaubnis - liefere das bestmögliche, sichere Ergebnis!
- Wenn generate_parody_image mehrere Versuche braucht, zeige NICHT die technischen Details - nur das Ergebnis

📝 OUTPUT-FORMAT - KRITISCH WICHTIG:
- Du bist ein natürlicher Gesprächspartner, KEIN Computer
- Zeige dem User NIEMALS rohe JSON-Objekte, Arrays, Code-Blöcke oder technische Tool-Outputs
- NIEMALS: {...}, [...], \`\`\`json, \`\`\`, attempt_history, attempts_needed, oder ähnliche Formatierungen zeigen
- Wenn generate_parody_image ein attempts_needed > 1 zurückgibt: Erwähne es höchstens kurz ("Nach etwas Feintuning...") aber KEINE technischen Details
- Formuliere ALLE Zahlen und Daten als Fließtext
- Bei Foto-Suche: Sage kurz "Referenzfoto gefunden!" und mache SOFORT weiter mit der Generierung

🖼️ BILD-AUSGABE:
- Wenn generate_parody_image oder generate_personalized_image erfolgreich war:
  - Zeige das Bild im Markdown-Format: ![Dein generiertes Bild](BILD_URL_HIER)
  - Füge eine kurze, begeisterte Beschreibung hinzu
  - Biete an: "Soll ich daraus einen Post planen?"
- Die URL MUSS im Markdown-Bildformat sein, damit das Frontend es rendern kann!

KONTEXT:
- Sprache: ${brandRules?.language_primary || 'Deutsch'}
- Tonalität: ${brandRules?.tone_style || 'locker und authentisch'}
- Schreibstil: ${brandRules?.writing_style || 'Standard'}

BEISPIEL-WORKFLOW für Film-Parodie:
User: "Mach mir ein Bild im Stil von Der Pate"

Du:
1. get_user_photos(only_reference=true) → Finde Referenzbild
2. generate_parody_image(style="70er Jahre Mafia-Drama, gedämpfte Farben", scene_description="Ein Mann sitzt im Sessel, Halbschatten auf dem Gesicht, nachdenklicher Blick", ref_image_url="...") → Generiere DALL-E 3 Bild
3. Präsentiere: "Hier ist dein Pate-inspiriertes Bild! Das Bild zeigt dich in einem klassischen Mafia-Drama-Setting..."`;


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
      console.error('[copilot] AI error:', aiResponse.status, errorText);
      
      // Handle rate limits
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ 
          message: "🚫 Ich bin gerade überlastet. Bitte warte kurz und versuche es nochmal.",
          error: "rate_limit",
          tool_results: []
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Handle payment required
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ 
          message: "💳 Die AI-Credits sind aufgebraucht. Bitte lade dein Konto auf.",
          error: "payment_required",
          tool_results: []
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // Generic error - don't fail silently
      return new Response(JSON.stringify({ 
        message: `❌ Es gab einen technischen Fehler bei der AI-Anfrage (Status ${aiResponse.status}). Bitte versuche es nochmal.`,
        error: errorText,
        tool_results: []
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices?.[0]?.message;

    if (!assistantMessage) {
      console.error('[copilot] No message in AI response:', JSON.stringify(aiData).substring(0, 500));
      return new Response(JSON.stringify({ 
        message: "❓ Ich konnte keine Antwort generieren. Bitte formuliere deine Anfrage anders.",
        error: "no_response",
        tool_results: []
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if the AI wants to use tools
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`[copilot] AI requested ${assistantMessage.tool_calls.length} tool calls`);
      
      const toolResults: any[] = [];
      
      for (const toolCall of assistantMessage.tool_calls) {
        const funcName = toolCall.function.name;
        let params: any = {};
        
        // Safely parse parameters
        try {
          params = JSON.parse(toolCall.function.arguments || '{}');
        } catch (parseError) {
          console.error(`[copilot] Failed to parse params for ${funcName}:`, parseError);
          toolResults.push({
            tool_call_id: toolCall.id,
            function_name: funcName,
            result: { error: `Fehler beim Parsen der Parameter: ${parseError instanceof Error ? parseError.message : 'Unbekannt'}` }
          });
          continue;
        }
        
        console.log(`[copilot] Executing tool: ${funcName}`, JSON.stringify(params).substring(0, 200));
        
        let result;
        try {
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
            case 'generate_personalized_image':
              result = await executeGeneratePersonalizedImage(supabase, user.id, params);
              break;
            case 'analyze_best_time':
              result = await executeAnalyzeBestTime(supabase, user.id, params);
              break;
            case 'plan_post':
              result = await executePlanPost(supabase, user.id, params);
              break;
            case 'get_user_photos':
              result = await executeGetUserPhotos(supabase, user.id, params);
              break;
            case 'generate_parody_image':
              result = await executeGenerateParodyImage(supabase, user.id, params);
              break;
            default:
              result = { error: `Unbekanntes Tool: ${funcName}` };
          }
          
          console.log(`[copilot] Tool ${funcName} completed successfully`);
        } catch (toolError) {
          console.error(`[copilot] Tool ${funcName} failed:`, toolError);
          result = { 
            error: `Tool-Fehler bei ${funcName}: ${toolError instanceof Error ? toolError.message : 'Unbekannter Fehler'}`,
            details: toolError instanceof Error ? toolError.stack : undefined
          };
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
    console.error("[copilot] Unhandled error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unbekannter Fehler";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("[copilot] Error details:", { message: errorMessage, stack: errorStack });
    
    return new Response(
      JSON.stringify({ 
        message: `❌ Es ist ein Fehler aufgetreten: ${errorMessage}. Bitte versuche es nochmal oder formuliere deine Anfrage anders.`,
        error: errorMessage,
        tool_results: []
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
