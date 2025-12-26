import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClassificationResult {
  category: string;
  mood: string;
  topic_tags: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY nicht konfiguriert');
    }

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    // Parse request body
    const body = await req.json();
    const { post_id, image_url, caption, batch_mode } = body;

    // If batch_mode, classify multiple unclassified posts
    if (batch_mode) {
      const limit = body.limit || 10;
      
      // Get unclassified posts with images
      const { data: posts, error: fetchError } = await supabase
        .from('posts')
        .select('id, caption, original_media_url')
        .eq('user_id', user.id)
        .eq('is_imported', true)
        .is('category', null)
        .not('original_media_url', 'is', null)
        .order('published_at', { ascending: false })
        .limit(limit);

      if (fetchError) throw fetchError;

      if (!posts || posts.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          classified: 0,
          message: 'Keine unklassifizierten Posts gefunden'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`Batch classifying ${posts.length} posts for user ${user.id}`);

      let classifiedCount = 0;
      const errors: string[] = [];

      for (const post of posts) {
        try {
          const result = await classifyContent(
            lovableApiKey,
            post.original_media_url,
            post.caption
          );

          if (result) {
            const { error: updateError } = await supabase
              .from('posts')
              .update({
                category: result.category,
                mood: result.mood,
                topic_tags: result.topic_tags,
              })
              .eq('id', post.id);

            if (updateError) {
              errors.push(`Post ${post.id}: ${updateError.message}`);
            } else {
              classifiedCount++;
            }
          }

          // Rate limiting - pause between requests
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`Post ${post.id}: ${msg}`);
          console.error(`Error classifying post ${post.id}:`, err);
        }
      }

      // Log the classification
      await supabase.from('logs').insert({
        user_id: user.id,
        event_type: 'batch_content_classification',
        level: errors.length > 0 ? 'warn' : 'info',
        details: {
          total_posts: posts.length,
          classified_count: classifiedCount,
          error_count: errors.length,
          errors: errors.slice(0, 5), // Only log first 5 errors
        },
      });

      return new Response(JSON.stringify({
        success: true,
        classified: classifiedCount,
        total: posts.length,
        errors: errors.length,
        message: `${classifiedCount}/${posts.length} Posts klassifiziert`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single post classification
    if (!post_id) {
      throw new Error('post_id ist erforderlich');
    }

    // Get post data if not provided
    let postImageUrl = image_url;
    let postCaption = caption;

    if (!postImageUrl || postCaption === undefined) {
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('original_media_url, caption')
        .eq('id', post_id)
        .eq('user_id', user.id)
        .single();

      if (postError || !post) {
        throw new Error('Post nicht gefunden');
      }

      postImageUrl = postImageUrl || post.original_media_url;
      postCaption = postCaption !== undefined ? postCaption : post.caption;
    }

    console.log(`Classifying single post ${post_id} for user ${user.id}`);

    const result = await classifyContent(lovableApiKey, postImageUrl, postCaption);

    if (!result) {
      throw new Error('Klassifizierung fehlgeschlagen');
    }

    // Update post with classification
    const { error: updateError } = await supabase
      .from('posts')
      .update({
        category: result.category,
        mood: result.mood,
        topic_tags: result.topic_tags,
      })
      .eq('id', post_id)
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      success: true,
      post_id,
      classification: result,
      message: `Post als "${result.category}" klassifiziert`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      success: false,
      error: message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function classifyContent(
  apiKey: string,
  imageUrl: string | null,
  caption: string | null
): Promise<ClassificationResult | null> {
  const systemPrompt = `Du bist ein Content-Analyst für Instagram-Posts. Analysiere den Post und klassifiziere ihn.

Antworte NUR mit dem Tool-Call, keine zusätzliche Erklärung.

Kategorien zur Auswahl:
- Humor: Lustige, witzige, sarkastische Inhalte
- Behind the Scenes: Einblicke in Arbeit, Alltag, Making-of
- Promo: Werbung, Produktplatzierung, Kooperationen
- Inspiration: Motivierende, nachdenkliche Inhalte
- Privates: Persönliche Momente, Familie, Freizeit
- News: Aktuelle Ereignisse, Meinungen zu Themen
- Tutorial: Anleitungen, Tipps, How-to
- Entertainment: Unterhaltung, Shows, Events

Stimmungen zur Auswahl:
- Fröhlich, Sarkastisch, Ernst, Nachdenklich, Aufgeregt, Entspannt, Provokant, Nostalgisch`;

  const userContent: any[] = [
    {
      type: "text",
      text: `Analysiere diesen Instagram-Post:

Caption: "${caption || '(keine Caption)'}"

Ordne den Post einer Kategorie zu, bestimme die Stimmung und extrahiere 3-5 relevante Themen-Tags (auf Deutsch, ohne Hashtags).`
    }
  ];

  // Add image if available
  if (imageUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: imageUrl }
    });
  }

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_post",
              description: "Klassifiziere den Instagram-Post",
              parameters: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["Humor", "Behind the Scenes", "Promo", "Inspiration", "Privates", "News", "Tutorial", "Entertainment"],
                    description: "Die Hauptkategorie des Posts"
                  },
                  mood: {
                    type: "string",
                    enum: ["Fröhlich", "Sarkastisch", "Ernst", "Nachdenklich", "Aufgeregt", "Entspannt", "Provokant", "Nostalgisch"],
                    description: "Die Stimmung des Posts"
                  },
                  topic_tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 relevante Themen-Tags auf Deutsch"
                  }
                },
                required: ["category", "mood", "topic_tags"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "classify_post" } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        throw new Error('Rate limit erreicht - bitte später erneut versuchen');
      }
      if (response.status === 402) {
        throw new Error('AI-Credits aufgebraucht');
      }
      throw new Error(`AI API Fehler: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      return {
        category: args.category,
        mood: args.mood,
        topic_tags: args.topic_tags || []
      };
    }

    // Fallback: try to parse from content if no tool call
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      console.log('No tool call, trying to parse content:', content);
      // Basic fallback parsing
      return {
        category: 'Entertainment',
        mood: 'Entspannt',
        topic_tags: ['Instagram', 'Content']
      };
    }

    return null;
  } catch (error) {
    console.error('Classification API error:', error);
    throw error;
  }
}
