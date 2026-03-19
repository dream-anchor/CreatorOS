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

// ============================================================
// TASKS ENDPOINTS
// ============================================================

// GET /tasks — List tasks with optional filters
app.get("/tasks", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const status = c.req.query("status");
  const assignee = c.req.query("assignee");
  const priority = c.req.query("priority");

  let where = "WHERE 1=1";
  const params: unknown[] = [];
  let idx = 1;

  if (status) {
    where += ` AND status = $${idx}`;
    params.push(status);
    idx++;
  }
  if (assignee) {
    where += ` AND assignee = $${idx}`;
    params.push(assignee);
    idx++;
  }
  if (priority) {
    where += ` AND priority = $${idx}`;
    params.push(priority);
    idx++;
  }

  const rows = await query(sql,
    `SELECT id, title, description, status, priority, assignee, tags, blocked_reason,
            org_id, created_at, updated_at, completed_at
     FROM tasks ${where}
     ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END,
              created_at DESC`,
    params
  );

  return c.json(rows);
});

// POST /tasks — Create a new task
app.post("/tasks", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{
    title: string;
    description?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    tags?: string[];
    blocked_reason?: string;
  }>();

  if (!body.title) {
    return c.json({ error: "title ist Pflichtfeld" }, 400);
  }

  const rows = await query(sql,
    `INSERT INTO tasks (title, description, status, priority, assignee, tags, blocked_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      body.title,
      body.description || null,
      body.status || "todo",
      body.priority || "medium",
      body.assignee || "pixel",
      body.tags || [],
      body.blocked_reason || null,
    ]
  );

  return c.json(rows[0], 201);
});

// PATCH /tasks/:id — Update a task
app.patch("/tasks/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const taskId = c.req.param("id");
  const body = await c.req.json<{
    title?: string;
    description?: string;
    status?: string;
    priority?: string;
    assignee?: string;
    tags?: string[];
    blocked_reason?: string;
  }>();

  // Build dynamic SET clause
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (body.title !== undefined) { sets.push(`title = $${idx}`); params.push(body.title); idx++; }
  if (body.description !== undefined) { sets.push(`description = $${idx}`); params.push(body.description); idx++; }
  if (body.status !== undefined) {
    sets.push(`status = $${idx}`); params.push(body.status); idx++;
    if (body.status === "done") {
      sets.push(`completed_at = now()`);
    } else {
      sets.push(`completed_at = NULL`);
    }
  }
  if (body.priority !== undefined) { sets.push(`priority = $${idx}`); params.push(body.priority); idx++; }
  if (body.assignee !== undefined) { sets.push(`assignee = $${idx}`); params.push(body.assignee); idx++; }
  if (body.tags !== undefined) { sets.push(`tags = $${idx}`); params.push(body.tags); idx++; }
  if (body.blocked_reason !== undefined) { sets.push(`blocked_reason = $${idx}`); params.push(body.blocked_reason); idx++; }

  if (sets.length === 0) {
    return c.json({ error: "Keine Felder zum Aktualisieren" }, 400);
  }

  sets.push("updated_at = now()");
  params.push(taskId);

  const result = await query(sql,
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );

  if (result.length === 0) {
    return c.json({ error: "Task nicht gefunden" }, 404);
  }

  return c.json(result[0]);
});

// DELETE /tasks/:id — Delete a task
app.delete("/tasks/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const taskId = c.req.param("id");

  const result = await query(sql,
    `DELETE FROM tasks WHERE id = $1 RETURNING id`,
    [taskId]
  );

  if (result.length === 0) {
    return c.json({ error: "Task nicht gefunden" }, 404);
  }

  return c.json({ deleted: true, id: taskId });
});

// ============================================================
// DOCS ENDPOINTS
// ============================================================

// GET /docs — List docs with optional category filter
app.get("/docs", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const category = c.req.query("category");
  const search = c.req.query("search");

  let where = "WHERE 1=1";
  const params: unknown[] = [];
  let idx = 1;

  if (category) {
    where += ` AND category = $${idx}`;
    params.push(category);
    idx++;
  }
  if (search) {
    where += ` AND (title ILIKE $${idx} OR content ILIKE $${idx})`;
    params.push(`%${search}%`);
    idx++;
  }

  const rows = await query(sql,
    `SELECT id, title, content, category, tags, created_at, updated_at
     FROM pixel_docs ${where}
     ORDER BY created_at DESC`,
    params
  );

  return c.json(rows);
});

// POST /docs — Create a doc
app.post("/docs", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{
    title: string;
    content?: string;
    category?: string;
    tags?: string[];
  }>();

  if (!body.title) {
    return c.json({ error: "title ist Pflichtfeld" }, 400);
  }

  const rows = await query(sql,
    `INSERT INTO pixel_docs (title, content, category, tags)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [body.title, body.content || null, body.category || "Sonstiges", body.tags || []]
  );

  return c.json(rows[0], 201);
});

// ============================================================
// RULES ENDPOINTS
// ============================================================

// GET /rules — List rules with optional category filter
app.get("/rules", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const category = c.req.query("category");

  let where = "WHERE 1=1";
  const params: unknown[] = [];
  let idx = 1;

  if (category) {
    where += ` AND category = $${idx}`;
    params.push(category);
    idx++;
  }

  const rows = await query(sql,
    `SELECT id, rule_text, category, is_active, created_at, updated_at
     FROM pixel_rules ${where}
     ORDER BY category, created_at DESC`,
    params
  );

  return c.json(rows);
});

// POST /rules — Create a rule
app.post("/rules", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{
    rule_text: string;
    category?: string;
    is_active?: boolean;
  }>();

  if (!body.rule_text) {
    return c.json({ error: "rule_text ist Pflichtfeld" }, 400);
  }

  const rows = await query(sql,
    `INSERT INTO pixel_rules (rule_text, category, is_active)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [body.rule_text, body.category || "Allgemein", body.is_active !== false]
  );

  return c.json(rows[0], 201);
});

// PATCH /rules/:id — Update a rule
app.patch("/rules/:id", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const ruleId = c.req.param("id");
  const body = await c.req.json<{
    rule_text?: string;
    category?: string;
    is_active?: boolean;
  }>();

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (body.rule_text !== undefined) { sets.push(`rule_text = $${idx}`); params.push(body.rule_text); idx++; }
  if (body.category !== undefined) { sets.push(`category = $${idx}`); params.push(body.category); idx++; }
  if (body.is_active !== undefined) { sets.push(`is_active = $${idx}`); params.push(body.is_active); idx++; }

  if (sets.length === 0) {
    return c.json({ error: "Keine Felder zum Aktualisieren" }, 400);
  }

  sets.push("updated_at = now()");
  params.push(ruleId);

  const result = await query(sql,
    `UPDATE pixel_rules SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    params
  );

  if (result.length === 0) {
    return c.json({ error: "Regel nicht gefunden" }, 404);
  }

  return c.json(result[0]);
});

// ============================================================
// COSTS ENDPOINTS
// ============================================================

// GET /costs — List costs with optional service/period filter
app.get("/costs", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const service = c.req.query("service");
  const period = c.req.query("period");

  let where = "WHERE 1=1";
  const params: unknown[] = [];
  let idx = 1;

  if (service) {
    where += ` AND service = $${idx}`;
    params.push(service);
    idx++;
  }
  if (period) {
    where += ` AND period = $${idx}`;
    params.push(period);
    idx++;
  }

  const rows = await query(sql,
    `SELECT id, service, amount_cents, currency, period, details, created_at
     FROM api_costs ${where}
     ORDER BY period DESC, service`,
    params
  );

  return c.json(rows);
});

// POST /costs — Add a cost entry
app.post("/costs", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{
    service: string;
    amount_cents: number;
    currency?: string;
    period: string;
    details?: Record<string, unknown>;
  }>();

  if (!body.service || body.amount_cents === undefined || !body.period) {
    return c.json({ error: "service, amount_cents und period sind Pflichtfelder" }, 400);
  }

  const rows = await query(sql,
    `INSERT INTO api_costs (service, amount_cents, currency, period, details)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [body.service, body.amount_cents, body.currency || "EUR", body.period, JSON.stringify(body.details || {})]
  );

  return c.json(rows[0], 201);
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
