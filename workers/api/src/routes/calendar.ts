import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** GET /api/calendar - Get all posts for calendar view */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const posts = await query(sql,
    `SELECT p.*,
       (SELECT json_agg(a.*) FROM assets a WHERE a.post_id = p.id) as assets
     FROM posts p
     WHERE p.user_id = $1
     ORDER BY COALESCE(p.scheduled_at, p.created_at) ASC`,
    [userId]
  );

  return c.json(posts);
});

/** GET /api/calendar/content-plan - Get content plan entries */
app.get("/content-plan", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const plans = await query(sql,
    "SELECT * FROM content_plan WHERE user_id = $1 ORDER BY scheduled_for ASC",
    [userId]
  );

  return c.json(plans);
});

/** POST /api/calendar/content-plan - Create content plan entry */
app.post("/content-plan", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();

  const rows = await query(sql,
    `INSERT INTO content_plan (user_id, status, scheduled_for, concept_note, target_audience, content_type, topic_keywords)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, body.status || "draft", body.scheduled_for, body.concept_note, body.target_audience, body.content_type || "single", body.topic_keywords || null]
  );

  return c.json(rows[0]);
});

/** PATCH /api/calendar/content-plan/:id - Update content plan */
app.patch("/content-plan/:id", async (c) => {
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
    values.push(value);
    idx++;
  }

  if (fields.length > 0) {
    values.push(id, userId);
    await query(sql,
      `UPDATE content_plan SET ${fields.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1}`,
      values
    );
  }

  return c.json({ success: true });
});

export { app as calendarRoutes };
