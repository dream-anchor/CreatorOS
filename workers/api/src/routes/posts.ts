import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";
import { callOpenAI, extractToolArgs } from "../lib/ai";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** GET /api/posts - List posts */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const isImported = c.req.query("is_imported");
  const limit = parseInt(c.req.query("limit") || "100");
  const offset = parseInt(c.req.query("offset") || "0");

  let where = "WHERE p.user_id = $1";
  const params: unknown[] = [userId];
  let idx = 2;

  if (status) {
    where += ` AND p.status = $${idx}`;
    params.push(status);
    idx++;
  }
  if (isImported !== undefined) {
    where += ` AND p.is_imported = $${idx}`;
    params.push(isImported === "true");
    idx++;
  }

  params.push(limit, offset);
  const posts = await query(sql,
    `SELECT p.*,
       (SELECT json_agg(a.*) FROM assets a WHERE a.post_id = p.id) as post_assets,
       (SELECT json_agg(sa.*) FROM slide_assets sa WHERE sa.post_id = p.id) as slide_assets
     FROM posts p
     ${where}
     ORDER BY p.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return c.json(posts);
});

/** GET /api/posts/:id - Get single post */
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  const post = await queryOne(sql,
    `SELECT p.*,
       (SELECT json_agg(a.*) FROM assets a WHERE a.post_id = p.id) as post_assets,
       (SELECT json_agg(sa.*) FROM slide_assets sa WHERE sa.post_id = p.id) as slide_assets
     FROM posts p
     WHERE p.id = $1 AND p.user_id = $2`,
    [id, userId]
  );

  if (!post) return c.json({ error: "Post nicht gefunden" }, 404);
  return c.json(post);
});

/** POST /api/posts - Create post */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();

  const rows = await query(sql,
    `INSERT INTO posts (user_id, status, caption, hashtags, format, topic_id, scheduled_at, slides, collaborators, alt_text, caption_alt, caption_short)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      userId,
      body.status || "DRAFT",
      body.caption || null,
      body.hashtags || null,
      body.format || "single",
      body.topic_id || null,
      body.scheduled_at || null,
      body.slides ? JSON.stringify(body.slides) : null,
      body.collaborators || null,
      body.alt_text || null,
      body.caption_alt || null,
      body.caption_short || null,
    ]
  );

  return c.json(rows[0]);
});

/** PATCH /api/posts/:id - Update post */
app.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const body = await c.req.json();

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(body)) {
    if (["id", "user_id", "created_at"].includes(key)) continue;
    fields.push(`${key} = $${idx}`);
    values.push(key === "slides" && typeof value === "object" ? JSON.stringify(value) : value);
    idx++;
  }

  if (fields.length === 0) return c.json({ error: "Keine Felder" }, 400);

  values.push(id, userId);
  await query(sql,
    `UPDATE posts SET ${fields.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1}`,
    values
  );

  return c.json({ success: true });
});

/** DELETE /api/posts/:id - Delete post */
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  await query(sql, "DELETE FROM posts WHERE id = $1 AND user_id = $2", [id, userId]);
  return c.json({ success: true });
});

/** POST /api/posts/assets - Create asset for a post */
app.post("/assets", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();

  const rows = await query(sql,
    `INSERT INTO assets (user_id, post_id, storage_path, public_url, width, height, source, generator_meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [userId, body.post_id, body.storage_path, body.public_url, body.width || null, body.height || null, body.source || "upload", body.generator_meta ? JSON.stringify(body.generator_meta) : null]
  );

  return c.json(rows[0]);
});

/** POST /api/posts/slide-assets - Create slide asset */
app.post("/slide-assets", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();

  const rows = await query(sql,
    `INSERT INTO slide_assets (user_id, post_id, slide_index, storage_path, public_url, generated_text, asset_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, body.post_id, body.slide_index, body.storage_path || null, body.public_url || null, body.generated_text || null, body.asset_type || "image"]
  );

  return c.json(rows[0]);
});

/** POST /api/posts/generate-draft - AI draft generation */
app.post("/generate-draft", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();
  const { topic_id, format, freetext, image_urls, slide_texts } = body;

  // Load brand rules and topic
  const [brandRules, topic] = await Promise.all([
    queryOne(sql, "SELECT * FROM brand_rules WHERE user_id = $1", [userId]),
    topic_id ? queryOne(sql, "SELECT * FROM topics WHERE id = $1 AND user_id = $2", [topic_id, userId]) : null,
  ]);

  const br = brandRules as Record<string, unknown> | null;
  const model = (br?.ai_model as string) || "gpt-4o";

  // Build prompt based on format
  let systemPrompt = br?.style_system_prompt as string || "";
  if (!systemPrompt) {
    systemPrompt = `Du bist ein Instagram-Ghostwriter. Tonalität: ${br?.tone_style || "freundlich"}. Sprache: ${br?.language_primary || "DE"}.`;
  }

  const userPrompt = freetext
    ? `Erstelle einen Instagram-Post zu: "${freetext}"`
    : topic
    ? `Erstelle einen Instagram-Post zum Thema: "${(topic as Record<string, unknown>).title}"\nBeschreibung: ${(topic as Record<string, unknown>).description || ""}\nKeywords: ${((topic as Record<string, unknown>).keywords as string[])?.join(", ") || ""}`
    : "Erstelle einen kreativen Instagram-Post.";

  const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tools: [{
      type: "function",
      function: {
        name: "create_post",
        description: "Erstellt einen Instagram-Post-Entwurf",
        parameters: {
          type: "object",
          properties: {
            caption: { type: "string", description: "Die Haupt-Caption" },
            caption_alt: { type: "string", description: "Alternative Caption" },
            caption_short: { type: "string", description: "Kurz-Caption für Stories" },
            hashtags: { type: "string", description: "Hashtags als String" },
            alt_text: { type: "string", description: "Bildbeschreibung für Barrierefreiheit" },
          },
          required: ["caption", "hashtags"],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "create_post" } },
    max_completion_tokens: 2000,
  });

  const args = extractToolArgs<{
    caption: string;
    caption_alt?: string;
    caption_short?: string;
    hashtags: string;
    alt_text?: string;
  }>(aiResponse, "create_post");

  if (!args) {
    return c.json({ error: "KI konnte keinen Post generieren", success: false }, 500);
  }

  // Create post in DB
  const postRows = await query(sql,
    `INSERT INTO posts (user_id, status, caption, caption_alt, caption_short, hashtags, alt_text, format, topic_id)
     VALUES ($1, 'DRAFT', $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [userId, args.caption, args.caption_alt || null, args.caption_short || null, args.hashtags, args.alt_text || null, format || "single", topic_id || null]
  );

  await query(sql,
    "INSERT INTO logs (user_id, level, event_type, details) VALUES ($1, 'info', 'post_generated', $2)",
    [userId, JSON.stringify({ post_id: (postRows[0] as Record<string, unknown>).id, model })]
  );

  return c.json({ success: true, post: postRows[0] });
});

/** POST /api/posts/generate-hashtags - Generate hashtags */
app.post("/generate-hashtags", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { caption } = await c.req.json<{ caption: string }>();

  const brandRules = await queryOne<Record<string, unknown>>(sql,
    "SELECT hashtag_min, hashtag_max, ai_model FROM brand_rules WHERE user_id = $1", [userId]);

  const min = (brandRules?.hashtag_min as number) || 8;
  const max = (brandRules?.hashtag_max as number) || 20;

  const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
    model: (brandRules?.ai_model as string) || "gpt-4o",
    messages: [
      { role: "system", content: `Generiere ${min}-${max} relevante Instagram-Hashtags für den folgenden Post. Mische populäre und Nischen-Hashtags.` },
      { role: "user", content: caption },
    ],
    max_completion_tokens: 500,
  });

  const hashtags = aiResponse.choices?.[0]?.message?.content || "";
  return c.json({ success: true, hashtags });
});

/** POST /api/posts/generate-asset - Generate AI image */
app.post("/generate-asset", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { post_id, prompt } = await c.req.json<{ post_id: string; prompt: string }>();

  const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Generate an image based on the following description." },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: 1000,
  });

  // The actual image generation would depend on the Lovable Gateway's capabilities
  // For now, return the AI response
  return c.json({
    success: true,
    result: aiResponse.choices?.[0]?.message?.content,
  });
});

/** POST /api/posts/classify - Classify post content */
app.post("/classify", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { post_ids } = await c.req.json<{ post_ids: string[] }>();

  if (!post_ids || post_ids.length === 0) {
    return c.json({ error: "post_ids required" }, 400);
  }

  const results: Array<{ id: string; category: string; mood: string; topic_tags: string[] }> = [];

  for (const postId of post_ids) {
    const post = await queryOne<Record<string, unknown>>(sql,
      "SELECT id, caption, original_media_url FROM posts WHERE id = $1 AND user_id = $2",
      [postId, userId]
    );
    if (!post) continue;

    const messages: Array<{ role: string; content: unknown }> = [
      {
        role: "system",
        content: "Klassifiziere diesen Instagram-Post. Nutze das Tool.",
      },
      {
        role: "user",
        content: post.original_media_url
          ? [
              { type: "text", text: `Caption: "${post.caption || ""}"` },
              { type: "image_url", image_url: { url: post.original_media_url as string } },
            ]
          : `Caption: "${post.caption || ""}"`,
      },
    ];

    const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
      model: "gpt-4o",
      messages,
      tools: [{
        type: "function",
        function: {
          name: "classify_post",
          description: "Klassifiziert einen Instagram-Post",
          parameters: {
            type: "object",
            properties: {
              category: { type: "string" },
              mood: { type: "string" },
              topic_tags: { type: "array", items: { type: "string" } },
            },
            required: ["category", "mood", "topic_tags"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "classify_post" } },
      max_completion_tokens: 500,
    });

    const args = extractToolArgs<{ category: string; mood: string; topic_tags: string[] }>(aiResponse, "classify_post");
    if (args) {
      await query(sql,
        "UPDATE posts SET category = $1, mood = $2, topic_tags = $3 WHERE id = $4",
        [args.category, args.mood, args.topic_tags, postId]
      );
      results.push({ id: postId, ...args });
    }

    // Rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  return c.json({ success: true, classified: results.length, results });
});

/** POST /api/posts/generate-reply - Generate AI reply for a comment */
app.post("/generate-reply", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { comment_text, tone, comment_id } = await c.req.json<{
    comment_text: string;
    tone?: string;
    comment_id?: string;
  }>();

  const brandRules = await queryOne<Record<string, unknown>>(sql,
    "SELECT reply_style_system_prompt, ai_model, tone_style FROM brand_rules WHERE user_id = $1",
    [userId]
  );

  const systemPrompt = (brandRules?.reply_style_system_prompt as string) ||
    `Du antwortest auf Instagram-Kommentare im Stil: ${brandRules?.tone_style || "freundlich"}.`;

  const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
    model: (brandRules?.ai_model as string) || "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Antworte auf diesen Kommentar:\n"${comment_text}"${tone ? `\nTon: ${tone}` : ""}` },
    ],
    max_completion_tokens: 500,
  });

  const reply = aiResponse.choices?.[0]?.message?.content || "";

  // Save suggestion if comment_id provided
  if (comment_id) {
    await query(sql,
      "UPDATE instagram_comments SET ai_reply_suggestion = $1 WHERE id = $2 AND user_id = $3",
      [reply, comment_id, userId]
    );
  }

  return c.json({ success: true, reply });
});

/** POST /api/posts/analyze-style - Analyze writing style from posts */
app.post("/analyze-style", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const posts = await query<Record<string, unknown>>(sql,
    "SELECT caption FROM posts WHERE user_id = $1 AND caption IS NOT NULL AND caption != '' ORDER BY created_at DESC LIMIT 30",
    [userId]
  );

  if (posts.length < 5) {
    return c.json({ error: "Mindestens 5 Posts mit Caption benötigt", success: false }, 400);
  }

  const captions = posts.map((p) => p.caption).join("\n---\n");

  const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "Du bist ein Ghostwriter-Analyst. Analysiere den Schreibstil und erstelle einen System-Prompt, der diesen Stil repliziert.",
      },
      {
        role: "user",
        content: `Analysiere den Schreibstil dieser ${posts.length} Instagram-Captions:\n\n${captions}`,
      },
    ],
    tools: [{
      type: "function",
      function: {
        name: "save_style_analysis",
        description: "Speichert die Stilanalyse",
        parameters: {
          type: "object",
          properties: {
            style_system_prompt: { type: "string", description: "System-Prompt der den Stil repliziert" },
            tone_style: { type: "string", description: "Beschreibung des Tons in 2-3 Wörtern" },
          },
          required: ["style_system_prompt", "tone_style"],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "save_style_analysis" } },
    max_completion_tokens: 2000,
  });

  const args = extractToolArgs<{ style_system_prompt: string; tone_style: string }>(aiResponse, "save_style_analysis");
  if (!args) return c.json({ error: "Stilanalyse fehlgeschlagen", success: false }, 500);

  await query(sql,
    "UPDATE brand_rules SET style_system_prompt = $1, tone_style = $2, last_style_analysis_at = NOW() WHERE user_id = $3",
    [args.style_system_prompt, args.tone_style, userId]
  );

  return c.json({ success: true, ...args });
});

/** POST /api/posts/analyze-reply-style - Analyze reply style */
app.post("/analyze-reply-style", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const replies = await query<Record<string, unknown>>(sql,
    "SELECT reply_text FROM reply_queue WHERE user_id = $1 AND status = 'sent' ORDER BY created_at DESC LIMIT 50",
    [userId]
  );

  if (replies.length < 10) {
    return c.json({ error: "Mindestens 10 gesendete Antworten benötigt", success: false }, 400);
  }

  const replyTexts = replies.map((r) => r.reply_text).join("\n---\n");

  const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
    model: "gpt-4o",
    messages: [
      { role: "system", content: "Analysiere den Antwortstil dieser Instagram-Kommentar-Antworten." },
      { role: "user", content: `${replies.length} Antworten:\n\n${replyTexts}` },
    ],
    tools: [{
      type: "function",
      function: {
        name: "save_reply_style",
        parameters: {
          type: "object",
          properties: {
            reply_style_system_prompt: { type: "string" },
            reply_style_description: { type: "string" },
          },
          required: ["reply_style_system_prompt", "reply_style_description"],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "save_reply_style" } },
    max_completion_tokens: 2000,
  });

  const args = extractToolArgs<{ reply_style_system_prompt: string; reply_style_description: string }>(
    aiResponse, "save_reply_style"
  );
  if (!args) return c.json({ error: "Analyse fehlgeschlagen", success: false }, 500);

  await query(sql,
    "UPDATE brand_rules SET reply_style_system_prompt = $1, reply_style_description = $2 WHERE user_id = $3",
    [args.reply_style_system_prompt, args.reply_style_description, userId]
  );

  return c.json({ success: true, ...args });
});

/** POST /api/posts/repair-metadata - Repair post metadata from Instagram */
app.post("/repair-metadata", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const conn = await queryOne<Record<string, unknown>>(sql,
    "SELECT token_encrypted FROM meta_connections WHERE user_id = $1", [userId]);
  if (!conn?.token_encrypted) return c.json({ error: "Keine Instagram-Verbindung" }, 400);

  const posts = await query<Record<string, unknown>>(sql,
    "SELECT id, ig_media_id FROM posts WHERE user_id = $1 AND ig_media_id IS NOT NULL AND (likes_count = 0 OR impressions_count = 0) LIMIT 50",
    [userId]
  );

  let repaired = 0;
  for (const post of posts) {
    try {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${post.ig_media_id}?fields=like_count,comments_count,insights.metric(impressions,reach,saved)&access_token=${conn.token_encrypted}`
      );
      if (!igRes.ok) continue;

      const igData = await igRes.json() as Record<string, unknown>;
      const insights = (igData.insights as Record<string, unknown>)?.data as Array<Record<string, unknown>> || [];
      const impressions = insights.find((i) => i.name === "impressions");
      const reach = insights.find((i) => i.name === "reach");
      const saved = insights.find((i) => i.name === "saved");

      await query(sql,
        "UPDATE posts SET likes_count = $1, comments_count = $2, impressions_count = $3, reach_count = $4, saved_count = $5 WHERE id = $6",
        [
          igData.like_count || 0,
          igData.comments_count || 0,
          (impressions?.values as Array<Record<string, unknown>>)?.[0]?.value || 0,
          (reach?.values as Array<Record<string, unknown>>)?.[0]?.value || 0,
          (saved?.values as Array<Record<string, unknown>>)?.[0]?.value || 0,
          post.id,
        ]
      );
      repaired++;
    } catch {
      continue;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return c.json({ success: true, repaired, total: posts.length });
});

export { app as postsRoutes };
