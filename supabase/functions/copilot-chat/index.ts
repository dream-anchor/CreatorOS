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

    // System prompt for the agent
    const systemPrompt = `Du bist Antoine's Community Co-Pilot, ein intelligenter Assistent für Social Media Management.

DEINE FÄHIGKEITEN:
- Posts und Kommentare durchsuchen (search_posts)
- Stimmung/Reaktionen analysieren (analyze_sentiment)
- Antwort-Entwürfe erstellen (draft_reply)
- Offene Kommentare finden (get_open_comments)

KONTEXT:
- Sprache: ${brandRules?.language_primary || 'Deutsch'}
- Tonalität: ${brandRules?.tone_style || 'locker und authentisch'}
- Formalität: ${brandRules?.formality_mode || 'smart'}

VERHALTEN:
- Antworte immer auf Deutsch
- Nutze die Tools aktiv, wenn der User nach Daten fragt
- Fasse Tool-Ergebnisse kurz und hilfreich zusammen
- Bei mehreren Ergebnissen: Zeige die wichtigsten und biete an, mehr zu zeigen
- Wenn du Posts/Kommentare findest, beschreibe sie kurz und biete Aktionen an

BEISPIEL-INTERAKTIONEN:
User: "Zeig mir alle Posts über Tatort"
→ Nutze search_posts mit query="Tatort"

User: "Wie war die Reaktion auf mein letztes Bild?"
→ Nutze get_open_comments oder analyze_sentiment

User: "Beantworte diesen Kommentar witzig"
→ Nutze draft_reply mit instruction="witzig"`;

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
