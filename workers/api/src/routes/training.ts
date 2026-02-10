import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query } from "../lib/db";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** GET /api/training - Get training data */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const data = await query(sql,
    "SELECT * FROM reply_training_data WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );

  return c.json(data);
});

/** POST /api/training - Submit training data (better reply) */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{
    comment_text: string;
    original_ai_reply?: string;
    better_reply: string;
    correction_reason?: string;
    correction_note?: string;
  }>();

  const rows = await query(sql,
    `INSERT INTO reply_training_data (user_id, comment_text, original_ai_reply, better_reply, correction_reason, correction_note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, body.comment_text, body.original_ai_reply || null, body.better_reply, body.correction_reason || null, body.correction_note || null]
  );

  return c.json(rows[0]);
});

/** GET /api/training/topics - Get topics */
app.get("/topics", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const topics = await query(sql,
    "SELECT * FROM topics WHERE user_id = $1 ORDER BY priority DESC, created_at DESC", [userId]);
  return c.json(topics);
});

/** POST /api/training/topics - Create topic */
app.post("/topics", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();

  const rows = await query(sql,
    `INSERT INTO topics (user_id, title, description, keywords, priority, evergreen)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, body.title, body.description || null, body.keywords || [], body.priority || 3, body.evergreen || false]
  );

  return c.json(rows[0]);
});

/** DELETE /api/training/topics/:id - Delete topic */
app.delete("/topics/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  await query(sql, "DELETE FROM topics WHERE id = $1 AND user_id = $2", [id, userId]);
  return c.json({ success: true });
});

/** POST /api/training/topic-research - AI topic research */
app.post("/topic-research", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { query: searchQuery } = await c.req.json<{ query: string }>();

  const { callOpenAI, extractToolArgs } = await import("../lib/ai");

  const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
    messages: [
      { role: "system", content: "Du bist ein Content-Strategie-Experte. Recherchiere Instagram-Themen." },
      { role: "user", content: `Recherchiere: "${searchQuery}". Schlage 5 konkrete Themen vor mit Titel, Beschreibung und Keywords.` },
    ],
    tools: [{
      type: "function",
      function: {
        name: "suggest_topics",
        parameters: {
          type: "object",
          properties: {
            topics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  keywords: { type: "array", items: { type: "string" } },
                },
                required: ["title", "description", "keywords"],
              },
            },
          },
          required: ["topics"],
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "suggest_topics" } },
    max_completion_tokens: 2000,
  });

  const args = extractToolArgs<{ topics: Array<{ title: string; description: string; keywords: string[] }> }>(
    aiResponse, "suggest_topics"
  );

  return c.json({ success: true, topics: args?.topics || [] });
});

/** GET /api/training/emoji-nogo - Get emoji no-go terms */
app.get("/emoji-nogo", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const terms = await query(sql, "SELECT * FROM emoji_nogo_terms WHERE user_id = $1", [userId]);
  return c.json(terms);
});

/** POST /api/training/emoji-nogo - Add emoji no-go term */
app.post("/emoji-nogo", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { term } = await c.req.json<{ term: string }>();

  await query(sql, "INSERT INTO emoji_nogo_terms (user_id, term) VALUES ($1, $2)", [userId, term]);
  return c.json({ success: true });
});

/** GET /api/training/collaborators - Get collaborators */
app.get("/collaborators", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const collabs = await query(sql,
    "SELECT * FROM collaborators WHERE user_id = $1 ORDER BY use_count DESC", [userId]);
  return c.json(collabs);
});

/** POST /api/training/collaborators - Add/update collaborator */
app.post("/collaborators", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { username, full_name, avatar_url } = await c.req.json<{
    username: string;
    full_name?: string;
    avatar_url?: string;
  }>();

  await query(sql,
    `INSERT INTO collaborators (user_id, username, full_name, avatar_url)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, username) DO UPDATE SET
       use_count = collaborators.use_count + 1,
       last_used_at = NOW()`,
    [userId, username, full_name || null, avatar_url || null]
  );

  return c.json({ success: true });
});

export { app as trainingRoutes };
