import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** GET /api/events - Alle Events des Users (sortiert nach Datum) */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await query(sql,
    `SELECT e.*,
       COALESCE(
         (SELECT json_agg(json_build_object('auto_template', p.auto_template, 'status', p.status, 'id', p.id))
          FROM posts p WHERE p.event_id = e.id),
         '[]'::json
       ) AS generated_posts
     FROM events e
     WHERE e.user_id = $1
     ORDER BY e.date ASC`,
    [userId]
  );

  return c.json(rows);
});

/** GET /api/events/upcoming - Nächste 10 aktive Events ab heute */
app.get("/upcoming", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await query(sql,
    `SELECT * FROM events
     WHERE user_id = $1 AND is_active = true AND date >= CURRENT_DATE
     ORDER BY date ASC
     LIMIT 10`,
    [userId]
  );

  return c.json(rows);
});

/** GET /api/events/:id - Einzelnes Event */
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const row = await queryOne(sql,
    "SELECT * FROM events WHERE id = $1 AND user_id = $2",
    [c.req.param("id"), userId]
  );

  if (!row) return c.json({ error: "Event nicht gefunden" }, 404);
  return c.json(row);
});

/** POST /api/events - Event erstellen */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();

  const rows = await query(sql,
    `INSERT INTO events (user_id, title, date, time, venue, city, ticket_url, description, cast_members, event_type, image_url, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      userId,
      body.title,
      body.date,
      body.time || "20:00",
      body.venue,
      body.city,
      body.ticket_url || null,
      body.description || null,
      body.cast_members || [],
      body.event_type || "standard",
      body.image_url || null,
      body.is_active !== undefined ? body.is_active : true,
    ]
  );

  return c.json(rows[0]);
});

/** PATCH /api/events/:id - Event updaten */
app.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
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

  if (fields.length === 0) return c.json({ error: "Keine Felder zum Aktualisieren" }, 400);

  values.push(c.req.param("id"), userId);
  await query(sql,
    `UPDATE events SET ${fields.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1}`,
    values
  );

  return c.json({ success: true });
});

/** DELETE /api/events/:id - Event löschen */
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  await query(sql,
    "DELETE FROM events WHERE id = $1 AND user_id = $2",
    [c.req.param("id"), userId]
  );

  return c.json({ success: true });
});

export { app as eventsRoutes };
