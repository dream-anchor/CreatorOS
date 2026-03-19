import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";

const app = new Hono<{ Bindings: Env }>();

// Auth middleware: X-API-Key header must match PIXEL_API_KEY
app.use("*", async (c, next) => {
  const apiKey = c.req.header("X-API-Key");
  if (!apiKey || apiKey !== c.env.PIXEL_API_KEY) {
    return c.json({ error: "Ungültiger API-Key" }, 401);
  }
  return next();
});

function getUserId(c: any): string {
  return c.env.PIXEL_USER_ID;
}

// POST /drafts — Create a new draft post
app.post("/drafts", async (c) => {
  const userId = getUserId(c);
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{
    caption: string;
    image_url?: string;
    format?: string;
    scheduled_at?: string;
  }>();

  const rows = await query(sql,
    `INSERT INTO posts (user_id, caption, format, scheduled_at, status)
     VALUES ($1, $2, $3, $4, 'DRAFT')
     RETURNING id, user_id, caption, format, scheduled_at, status, created_at`,
    [userId, body.caption, body.format || "single", body.scheduled_at || null]
  );

  const post = rows[0] as any;

  if (body.image_url && post) {
    await query(sql,
      `INSERT INTO assets (user_id, post_id, storage_path, public_url, source)
       VALUES ($1, $2, $3, $4, 'upload')`,
      [userId, post.id, body.image_url, body.image_url]
    );
  }

  return c.json(post, 201);
});

// GET /posts — List posts with optional filters
app.get("/posts", async (c) => {
  const userId = getUserId(c);
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") || "20", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  let where = "WHERE user_id = $1";
  const params: unknown[] = [userId];
  let idx = 2;

  if (status) {
    where += ` AND status = $${idx}`;
    params.push(status);
    idx++;
  }

  params.push(limit, offset);
  const rows = await query(sql,
    `SELECT id, caption, status, format, scheduled_at, published_at, created_at, updated_at
     FROM posts ${where}
     ORDER BY created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );

  return c.json(rows);
});

// PATCH /posts/:id — Update a post
app.patch("/posts/:id", async (c) => {
  const userId = getUserId(c);
  const sql = getDb(c.env.DATABASE_URL);
  const postId = c.req.param("id");
  const body = await c.req.json<{
    caption?: string;
    status?: string;
    scheduled_at?: string;
  }>();

  const result = await query(sql,
    `UPDATE posts
     SET caption = COALESCE($1, caption),
         status = COALESCE($2, status),
         scheduled_at = COALESCE($3, scheduled_at),
         updated_at = now()
     WHERE id = $4 AND user_id = $5
     RETURNING id, caption, status, format, scheduled_at, updated_at`,
    [body.caption ?? null, body.status ?? null, body.scheduled_at ?? null, postId, userId]
  );

  if (result.length === 0) {
    return c.json({ error: "Post nicht gefunden" }, 404);
  }

  return c.json(result[0]);
});

// GET /content-plan — Get content plan entries
app.get("/content-plan", async (c) => {
  const userId = getUserId(c);
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await query(sql,
    `SELECT id, status, scheduled_for, concept_note, target_audience, content_type,
            topic_keywords, generated_caption, generated_image_url, created_at
     FROM content_plan
     WHERE user_id = $1
     ORDER BY scheduled_for ASC NULLS LAST`,
    [userId]
  );

  return c.json(rows);
});

// GET /brand-rules — Get brand rules
app.get("/brand-rules", async (c) => {
  const userId = getUserId(c);
  const sql = getDb(c.env.DATABASE_URL);

  const row = await queryOne(sql,
    `SELECT tone_style, do_list, dont_list, emoji_level, hashtag_min, hashtag_max,
            language_primary, content_pillars, writing_style, taboo_words,
            formality_mode, disclaimers
     FROM brand_rules
     WHERE user_id = $1`,
    [userId]
  );

  if (!row) {
    return c.json({ error: "Keine Brand Rules gefunden" }, 404);
  }

  return c.json(row);
});

// GET /media — Get media assets
app.get("/media", async (c) => {
  const userId = getUserId(c);
  const sql = getDb(c.env.DATABASE_URL);
  const aiUsable = c.req.query("ai_usable");
  const limit = parseInt(c.req.query("limit") || "50", 10);

  let where = "WHERE user_id = $1";
  const params: unknown[] = [userId];
  let idx = 2;

  if (aiUsable === "true") {
    where += " AND ai_usable = true";
  }

  params.push(limit);
  const rows = await query(sql,
    `SELECT id, public_url, filename, tags, description, mood, ai_tags, ai_description,
            is_selfie, ai_usable, used_count, created_at
     FROM media_assets ${where}
     ORDER BY created_at DESC
     LIMIT $${idx}`,
    params
  );

  return c.json(rows);
});

// POST /schedule — Schedule a post
app.post("/schedule", async (c) => {
  const userId = getUserId(c);
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{
    post_id: string;
    scheduled_at: string;
  }>();

  const result = await query(sql,
    `UPDATE posts
     SET scheduled_at = $1, status = 'SCHEDULED', updated_at = now()
     WHERE id = $2 AND user_id = $3
     RETURNING id, caption, status, scheduled_at, updated_at`,
    [body.scheduled_at, body.post_id, userId]
  );

  if (result.length === 0) {
    return c.json({ error: "Post nicht gefunden" }, 404);
  }

  return c.json(result[0]);
});

export { app as externalRoutes };
