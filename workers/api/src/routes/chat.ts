import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";
import { callOpenAI } from "../lib/ai";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** GET /api/chat/conversations - List conversations */
app.get("/conversations", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const conversations = await query(sql,
    "SELECT * FROM chat_conversations WHERE user_id = $1 ORDER BY updated_at DESC", [userId]);
  return c.json(conversations);
});

/** POST /api/chat/conversations - Create conversation */
app.post("/conversations", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { title } = await c.req.json<{ title?: string }>();

  const rows = await query(sql,
    "INSERT INTO chat_conversations (user_id, title) VALUES ($1, $2) RETURNING *",
    [userId, title || null]
  );

  return c.json(rows[0]);
});

/** DELETE /api/chat/conversations/:id - Delete conversation */
app.delete("/conversations/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  await query(sql, "DELETE FROM chat_conversations WHERE id = $1 AND user_id = $2", [id, userId]);
  return c.json({ success: true });
});

/** GET /api/chat/conversations/:id/messages - Get messages */
app.get("/conversations/:id/messages", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const conversationId = c.req.param("id");

  // Verify ownership
  const conv = await queryOne(sql,
    "SELECT id FROM chat_conversations WHERE id = $1 AND user_id = $2", [conversationId, userId]);
  if (!conv) return c.json({ error: "Nicht gefunden" }, 404);

  const messages = await query(sql,
    "SELECT * FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at ASC",
    [conversationId]
  );
  return c.json(messages);
});

/** POST /api/chat/copilot - AI Copilot chat */
app.post("/copilot", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { message, conversation_id, history } = await c.req.json<{
    message: string;
    conversation_id?: string;
    history?: Array<{ role: string; content: string }>;
  }>();

  // Save user message
  if (conversation_id) {
    await query(sql,
      "INSERT INTO chat_messages (conversation_id, user_id, role, content) VALUES ($1, $2, 'user', $3)",
      [conversation_id, userId, message]
    );
  }

  // Load context for tools
  const [recentPosts, openComments, brandRules] = await Promise.all([
    query(sql, "SELECT id, caption, status, format, created_at FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20", [userId]),
    query(sql, "SELECT id, comment_text, commenter_username, ai_reply_suggestion FROM instagram_comments WHERE user_id = $1 AND is_replied = false AND is_hidden = false ORDER BY comment_timestamp DESC LIMIT 30", [userId]),
    queryOne(sql, "SELECT * FROM brand_rules WHERE user_id = $1", [userId]),
  ]);

  const tools = [
    {
      type: "function",
      function: {
        name: "search_posts",
        description: "Suche in den Posts des Users",
        parameters: {
          type: "object",
          properties: { query: { type: "string" }, limit: { type: "integer" } },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "find_open_comments",
        description: "Finde unbeantwortete Kommentare",
        parameters: {
          type: "object",
          properties: { limit: { type: "integer" } },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "draft_reply",
        description: "Generiere eine Antwort auf einen Kommentar",
        parameters: {
          type: "object",
          properties: {
            comment_text: { type: "string" },
            tone: { type: "string" },
          },
          required: ["comment_text"],
        },
      },
    },
  ];

  const messages = [
    {
      role: "system",
      content: `Du bist der CreatorOS CoPilot - ein hilfreicher Assistent für Instagram Content Creator. Du hast Zugriff auf:\n- ${recentPosts.length} Posts\n- ${openComments.length} offene Kommentare\n- Brand Rules des Users\n\nAntworte immer auf Deutsch, sei hilfreich und proaktiv.`,
    },
    ...(history || []),
    { role: "user", content: message },
  ];

  const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
    messages,
    tools,
    max_completion_tokens: 2000,
  });

  const reply = aiResponse.choices?.[0]?.message?.content || "Entschuldigung, ich konnte keine Antwort generieren.";

  // Save assistant message
  if (conversation_id) {
    await query(sql,
      "INSERT INTO chat_messages (conversation_id, user_id, role, content) VALUES ($1, $2, 'assistant', $3)",
      [conversation_id, userId, reply]
    );
    await query(sql, "UPDATE chat_conversations SET updated_at = NOW() WHERE id = $1", [conversation_id]);
  }

  return c.json({ reply, tool_calls: aiResponse.choices?.[0]?.message?.tool_calls });
});

export { app as chatRoutes };
