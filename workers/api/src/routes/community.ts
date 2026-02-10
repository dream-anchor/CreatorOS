import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";
import { callOpenAI, extractToolArgs } from "../lib/ai";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** GET /api/community/comments - Get comments */
app.get("/comments", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const unreplied = c.req.query("unreplied") === "true";

  let where = "WHERE ic.user_id = $1";
  if (unreplied) where += " AND ic.is_replied = false AND ic.is_hidden = false";

  const comments = await query(sql,
    `SELECT ic.*, p.caption as post_caption, p.original_media_url as post_media_url
     FROM instagram_comments ic
     LEFT JOIN posts p ON ic.post_id = p.id
     ${where}
     ORDER BY ic.comment_timestamp DESC
     LIMIT 200`,
    [userId]
  );

  return c.json(comments);
});

/** POST /api/community/fetch-comments - Fetch from Instagram API */
app.post("/fetch-comments", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const conn = await queryOne<Record<string, unknown>>(sql,
    "SELECT ig_user_id, ig_username, token_encrypted FROM meta_connections WHERE user_id = $1", [userId]);
  if (!conn?.token_encrypted) return c.json({ error: "Keine Instagram-Verbindung" }, 400);

  const token = conn.token_encrypted as string;
  const igUserId = conn.ig_user_id as string;

  // Fetch recent media
  const mediaRes = await fetch(
    `https://graph.instagram.com/v21.0/${igUserId}/media?fields=id,timestamp&limit=25&access_token=${token}`
  );
  if (!mediaRes.ok) return c.json({ error: `Media-Abruf fehlgeschlagen: ${mediaRes.status}` }, 500);

  const mediaData = await mediaRes.json() as { data: Array<{ id: string; timestamp: string }> };
  let totalImported = 0;

  for (const media of mediaData.data) {
    // Check if media is within 90 days
    const mediaDate = new Date(media.timestamp);
    if (Date.now() - mediaDate.getTime() > 90 * 24 * 60 * 60 * 1000) continue;

    // Find the post
    const post = await queryOne<Record<string, unknown>>(sql,
      "SELECT id FROM posts WHERE ig_media_id = $1 AND user_id = $2", [media.id, userId]);

    // Fetch comments
    const commentsRes = await fetch(
      `https://graph.instagram.com/v21.0/${media.id}/comments?fields=id,text,username,timestamp,replies{id,text,username,timestamp}&limit=100&access_token=${token}`
    );
    if (!commentsRes.ok) continue;

    const commentsData = await commentsRes.json() as { data: Array<Record<string, unknown>> };

    for (const comment of commentsData.data) {
      const existing = await queryOne(sql,
        "SELECT id FROM instagram_comments WHERE ig_comment_id = $1", [comment.id]);

      if (!existing) {
        await query(sql,
          `INSERT INTO instagram_comments (user_id, post_id, ig_comment_id, ig_media_id, commenter_username, comment_text, comment_timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (ig_comment_id) DO NOTHING`,
          [userId, post?.id || null, comment.id, media.id, comment.username, comment.text, comment.timestamp]
        );
        totalImported++;
      }

      // Check replies for user's own replies
      const replies = (comment.replies as { data: Array<Record<string, unknown>> })?.data || [];
      for (const reply of replies) {
        if ((reply.username as string) === conn.ig_username) {
          // Mark parent as replied
          await query(sql,
            "UPDATE instagram_comments SET is_replied = true WHERE ig_comment_id = $1",
            [comment.id]
          );
        }
      }
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return c.json({ success: true, imported: totalImported });
});

/** POST /api/community/analyze-comments - AI analysis + reply suggestions */
app.post("/analyze-comments", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { comment_ids } = await c.req.json<{ comment_ids: string[] }>();

  const [brandRules, blacklist, emojiNogo] = await Promise.all([
    queryOne<Record<string, unknown>>(sql, "SELECT * FROM brand_rules WHERE user_id = $1", [userId]),
    query<Record<string, unknown>>(sql, "SELECT topic FROM blacklist_topics WHERE user_id = $1", [userId]),
    query<Record<string, unknown>>(sql, "SELECT term FROM emoji_nogo_terms WHERE user_id = $1", [userId]),
  ]);

  const results: Array<Record<string, unknown>> = [];

  for (const commentId of comment_ids) {
    const comment = await queryOne<Record<string, unknown>>(sql,
      `SELECT ic.*, p.caption as post_caption
       FROM instagram_comments ic
       LEFT JOIN posts p ON ic.post_id = p.id
       WHERE ic.id = $1 AND ic.user_id = $2`,
      [commentId, userId]
    );
    if (!comment) continue;

    const systemPrompt = (brandRules?.reply_style_system_prompt as string) ||
      `Du antwortest auf Instagram-Kommentare. Tonalität: ${brandRules?.tone_style || "freundlich"}.`;

    const blacklistTopics = blacklist.map((b) => b.topic).join(", ");
    const nogoTerms = emojiNogo.map((e) => e.term).join(", ");

    const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
      model: (brandRules?.ai_model as string) || "gpt-4o",
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nBlacklist-Themen (nicht ansprechen): ${blacklistTopics || "keine"}\nVerbotene Begriffe: ${nogoTerms || "keine"}`,
        },
        {
          role: "user",
          content: `Post-Caption: "${comment.post_caption || ""}"\nKommentar von @${comment.commenter_username}: "${comment.comment_text}"\n\nGeneriere eine passende Antwort.`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "analyze_and_reply",
          parameters: {
            type: "object",
            properties: {
              sentiment_score: { type: "number" },
              is_critical: { type: "boolean" },
              reply_suggestion: { type: "string" },
            },
            required: ["sentiment_score", "is_critical", "reply_suggestion"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "analyze_and_reply" } },
      max_completion_tokens: 500,
    });

    const args = extractToolArgs<{ sentiment_score: number; is_critical: boolean; reply_suggestion: string }>(
      aiResponse, "analyze_and_reply"
    );

    if (args) {
      await query(sql,
        "UPDATE instagram_comments SET sentiment_score = $1, is_critical = $2, ai_reply_suggestion = $3 WHERE id = $4",
        [args.sentiment_score, args.is_critical, args.reply_suggestion, commentId]
      );
      results.push({ id: commentId, ...args });
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return c.json({ success: true, analyzed: results.length, results });
});

/** POST /api/community/batch-generate-replies - Batch generate AI replies */
app.post("/batch-generate-replies", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { comment_ids } = await c.req.json<{ comment_ids: string[] }>();

  // Delegate to analyze-comments with reply generation
  const results: Array<Record<string, unknown>> = [];

  for (const commentId of comment_ids) {
    const comment = await queryOne<Record<string, unknown>>(sql,
      `SELECT ic.*, p.caption as post_caption
       FROM instagram_comments ic LEFT JOIN posts p ON ic.post_id = p.id
       WHERE ic.id = $1 AND ic.user_id = $2`,
      [commentId, userId]
    );
    if (!comment) continue;

    const brandRules = await queryOne<Record<string, unknown>>(sql,
      "SELECT reply_style_system_prompt, ai_model, tone_style FROM brand_rules WHERE user_id = $1", [userId]);

    const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
      model: (brandRules?.ai_model as string) || "gpt-4o",
      messages: [
        {
          role: "system",
          content: (brandRules?.reply_style_system_prompt as string) ||
            `Antworte auf Instagram-Kommentare. Stil: ${brandRules?.tone_style || "freundlich"}.`,
        },
        {
          role: "user",
          content: `Kommentar von @${comment.commenter_username}: "${comment.comment_text}"`,
        },
      ],
      max_completion_tokens: 300,
    });

    const reply = aiResponse.choices?.[0]?.message?.content || "";
    if (reply) {
      await query(sql, "UPDATE instagram_comments SET ai_reply_suggestion = $1 WHERE id = $2", [reply, commentId]);
      results.push({ id: commentId, reply });
    }

    await new Promise((r) => setTimeout(r, 400));
  }

  return c.json({ success: true, generated: results.length, results });
});

/** POST /api/community/reply - Reply to a comment */
app.post("/reply", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { comment_id, reply_text, send_now } = await c.req.json<{
    comment_id: string;
    reply_text: string;
    send_now?: boolean;
  }>();

  // Queue the reply
  await query(sql,
    "INSERT INTO reply_queue (user_id, comment_id, reply_text, status) VALUES ($1, $2, $3, $4)",
    [userId, comment_id, reply_text, send_now ? "pending" : "pending"]
  );

  return c.json({ success: true });
});

/** POST /api/community/queue-reply - Queue a reply from the comment card */
app.post("/queue-reply", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { comment_id, ig_comment_id, reply_text, status } = await c.req.json<{
    comment_id?: string;
    ig_comment_id: string;
    reply_text: string;
    status?: string;
  }>();

  await query(sql,
    "INSERT INTO comment_reply_queue (user_id, comment_id, ig_comment_id, reply_text, status) VALUES ($1, $2, $3, $4, $5)",
    [userId, comment_id || null, ig_comment_id, reply_text, status || "pending"]
  );

  return c.json({ success: true });
});

/** POST /api/community/moderate - Hide/delete/block comment */
app.post("/moderate", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { comment_id, action } = await c.req.json<{
    comment_id: string;
    action: "hide" | "delete" | "block";
  }>();

  const comment = await queryOne<Record<string, unknown>>(sql,
    "SELECT ig_comment_id FROM instagram_comments WHERE id = $1 AND user_id = $2",
    [comment_id, userId]
  );
  if (!comment) return c.json({ error: "Kommentar nicht gefunden" }, 404);

  const conn = await queryOne<Record<string, unknown>>(sql,
    "SELECT token_encrypted FROM meta_connections WHERE user_id = $1", [userId]);
  if (!conn?.token_encrypted) return c.json({ error: "Keine Verbindung" }, 400);

  const token = conn.token_encrypted as string;

  if (action === "hide") {
    await fetch(`https://graph.instagram.com/v21.0/${comment.ig_comment_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hide: true, access_token: token }),
    });
    await query(sql, "UPDATE instagram_comments SET is_hidden = true WHERE id = $1", [comment_id]);
  } else if (action === "delete") {
    await fetch(`https://graph.instagram.com/v21.0/${comment.ig_comment_id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: token }),
    });
    await query(sql, "DELETE FROM instagram_comments WHERE id = $1", [comment_id]);
  }

  return c.json({ success: true });
});

/** POST /api/community/regenerate-reply - Regenerate AI reply */
app.post("/regenerate-reply", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { comment_id, instructions } = await c.req.json<{
    comment_id: string;
    instructions?: string;
  }>();

  const comment = await queryOne<Record<string, unknown>>(sql,
    `SELECT ic.*, p.caption as post_caption
     FROM instagram_comments ic LEFT JOIN posts p ON ic.post_id = p.id
     WHERE ic.id = $1 AND ic.user_id = $2`,
    [comment_id, userId]
  );
  if (!comment) return c.json({ error: "Nicht gefunden" }, 404);

  const brandRules = await queryOne<Record<string, unknown>>(sql,
    "SELECT reply_style_system_prompt, ai_model FROM brand_rules WHERE user_id = $1", [userId]);

  let prompt = `Kommentar von @${comment.commenter_username}: "${comment.comment_text}"`;
  if (instructions) prompt += `\n\nZusätzliche Anweisungen: ${instructions}`;

  const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
    model: (brandRules?.ai_model as string) || "gpt-4o",
    messages: [
      { role: "system", content: (brandRules?.reply_style_system_prompt as string) || "Antworte auf Instagram-Kommentare." },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: 500,
  });

  const reply = aiResponse.choices?.[0]?.message?.content || "";
  if (reply) {
    await query(sql, "UPDATE instagram_comments SET ai_reply_suggestion = $1 WHERE id = $2", [reply, comment_id]);
  }

  return c.json({ success: true, reply });
});

/** GET /api/community/blacklist - Get blacklist topics */
app.get("/blacklist", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const topics = await query(sql, "SELECT * FROM blacklist_topics WHERE user_id = $1", [userId]);
  return c.json(topics);
});

/** POST /api/community/blacklist - Add blacklist topic */
app.post("/blacklist", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { topic } = await c.req.json<{ topic: string }>();
  await query(sql, "INSERT INTO blacklist_topics (user_id, topic) VALUES ($1, $2)", [userId, topic]);
  return c.json({ success: true });
});

/** GET /api/community/reply-queue - Get reply queue status */
app.get("/reply-queue", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const pending = await query(sql,
    "SELECT * FROM reply_queue WHERE user_id = $1 AND status = 'pending' ORDER BY created_at DESC",
    [userId]
  );
  const queuePending = await query(sql,
    "SELECT * FROM comment_reply_queue WHERE user_id = $1 AND status IN ('pending', 'waiting_for_post') ORDER BY created_at DESC",
    [userId]
  );
  return c.json({ reply_queue: pending, comment_reply_queue: queuePending });
});

export { app as communityRoutes };
