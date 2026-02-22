import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** GET /api/settings - Get user settings + profile + brand_rules */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const [settings, profile, brandRules] = await Promise.all([
    queryOne(sql, "SELECT * FROM settings WHERE user_id = $1", [userId]),
    queryOne(sql, "SELECT * FROM profiles WHERE id = $1", [userId]),
    queryOne(sql, "SELECT * FROM brand_rules WHERE user_id = $1", [userId]),
  ]);

  return c.json({ settings, profile, brandRules });
});

/** POST /api/settings - Save settings + profile (from frontend) */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{ profile?: Record<string, unknown>; settings?: Record<string, unknown> }>();

  // Upsert settings
  if (body.settings && Object.keys(body.settings).length > 0) {
    const existing = await queryOne(sql, "SELECT user_id FROM settings WHERE user_id = $1", [userId]);
    if (existing) {
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      for (const [key, value] of Object.entries(body.settings)) {
        if (["id", "user_id", "created_at"].includes(key)) continue;
        fields.push(`${key} = $${idx}`);
        values.push(value);
        idx++;
      }
      if (fields.length > 0) {
        values.push(userId);
        await query(sql, `UPDATE settings SET ${fields.join(", ")} WHERE user_id = $${idx}`, values);
      }
    } else {
      const cols = ["user_id"];
      const vals: unknown[] = [userId];
      let idx = 2;
      for (const [key, value] of Object.entries(body.settings)) {
        if (["id", "user_id", "created_at"].includes(key)) continue;
        cols.push(key);
        vals.push(value);
        idx++;
      }
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      await query(sql, `INSERT INTO settings (${cols.join(", ")}) VALUES (${placeholders})`, vals);
    }
  }

  // Upsert profile
  if (body.profile) {
    const displayName = body.profile.display_name as string | null;
    if (displayName !== undefined) {
      await query(sql,
        `UPDATE profiles SET display_name = $1 WHERE id = $2`,
        [displayName, userId]
      );
    }
  }

  return c.json({ success: true });
});

/** PATCH /api/settings - Update settings */
app.patch("/", async (c) => {
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

  values.push(userId);
  await query(sql,
    `UPDATE settings SET ${fields.join(", ")} WHERE user_id = $${idx}`,
    values
  );

  return c.json({ success: true });
});

/** PATCH /api/settings/profile - Update profile */
app.patch("/profile", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { display_name } = await c.req.json<{ display_name?: string }>();

  if (display_name !== undefined) {
    await query(sql, "UPDATE profiles SET display_name = $1 WHERE id = $2", [display_name, userId]);
  }

  return c.json({ success: true });
});

/** GET /api/settings/brand-rules - Get brand rules */
app.get("/brand-rules", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const rules = await queryOne(sql, "SELECT * FROM brand_rules WHERE user_id = $1", [userId]);
  return c.json(rules);
});

/** PATCH /api/settings/brand-rules - Update brand rules */
app.patch("/brand-rules", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(body)) {
    if (["id", "user_id", "created_at"].includes(key)) continue;
    fields.push(`${key} = $${idx}`);
    values.push(typeof value === "object" && value !== null && !Array.isArray(value) ? JSON.stringify(value) : value);
    idx++;
  }

  if (fields.length === 0) return c.json({ error: "Keine Felder" }, 400);

  values.push(userId);
  await query(sql,
    `UPDATE brand_rules SET ${fields.join(", ")} WHERE user_id = $${idx}`,
    values
  );

  return c.json({ success: true });
});

/** GET /api/settings/meta-connection - Get Instagram connection */
app.get("/meta-connection", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const conn = await queryOne(sql, "SELECT * FROM meta_connections WHERE user_id = $1", [userId]);
  return c.json(conn);
});

/** DELETE /api/settings/meta-connection/:id - Disconnect Instagram */
app.delete("/meta-connection/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  await query(sql, "DELETE FROM meta_connections WHERE id = $1 AND user_id = $2", [id, userId]);
  return c.json({ success: true });
});

/** GET /api/settings/user-role - Check user role */
app.get("/user-role", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const role = await queryOne(sql, "SELECT role FROM user_roles WHERE user_id = $1", [userId]);
  return c.json(role);
});

/** GET /api/settings/shortcut-api-key - Get shortcut API key (owner only) */
app.get("/shortcut-api-key", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const role = await queryOne<{ role: string }>(sql,
    "SELECT role FROM user_roles WHERE user_id = $1 AND role = 'owner'", [userId]);

  if (!role) return c.json({ error: "Nur für Owner" }, 403);

  // Return from env - this would be a secret set in wrangler
  return c.json({ apiKey: (c.env as unknown as Record<string, string>).SHORTCUT_API_KEY || null });
});

export { app as settingsRoutes };
