import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";
import { callOpenAI, extractToolArgs } from "../lib/ai";
import { generatePresignedUrl } from "../lib/r2";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** GET /api/media - List media assets */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const analyzed = c.req.query("analyzed");
  const aiUsable = c.req.query("ai_usable");

  let where = "WHERE user_id = $1";
  const params: unknown[] = [userId];
  let idx = 2;

  if (analyzed !== undefined) {
    where += ` AND analyzed = $${idx}`;
    params.push(analyzed === "true");
    idx++;
  }
  if (aiUsable !== undefined) {
    where += ` AND ai_usable = $${idx}`;
    params.push(aiUsable === "true");
    idx++;
  }

  const assets = await query(sql,
    `SELECT * FROM media_assets ${where} ORDER BY created_at DESC`,
    params
  );

  return c.json(assets);
});

/** POST /api/media - Create media asset */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();

  const rows = await query(sql,
    `INSERT INTO media_assets (user_id, storage_path, public_url, filename, tags, description, mood)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [userId, body.storage_path, body.public_url, body.filename || null, body.tags || [], body.description || null, body.mood || null]
  );

  return c.json(rows[0]);
});

/** PATCH /api/media/:id - Update media asset */
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
    values.push(value);
    idx++;
  }

  if (fields.length > 0) {
    values.push(id, userId);
    await query(sql,
      `UPDATE media_assets SET ${fields.join(", ")} WHERE id = $${idx} AND user_id = $${idx + 1}`,
      values
    );
  }

  return c.json({ success: true });
});

/** DELETE /api/media/:id - Delete media asset */
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");

  const asset = await queryOne<Record<string, unknown>>(sql,
    "SELECT storage_path FROM media_assets WHERE id = $1 AND user_id = $2", [id, userId]);

  if (asset?.storage_path) {
    try {
      await c.env.R2_BUCKET.delete(asset.storage_path as string);
    } catch {
      // Ignore delete errors
    }
  }

  await query(sql, "DELETE FROM media_assets WHERE id = $1 AND user_id = $2", [id, userId]);
  return c.json({ success: true });
});

/** POST /api/media/analyze-vision - AI vision analysis of media */
app.post("/analyze-vision", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { media_ids } = await c.req.json<{ media_ids: string[] }>();

  if (!media_ids || media_ids.length === 0) {
    return c.json({ error: "media_ids required" }, 400);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const mediaId of media_ids) {
    const asset = await queryOne<Record<string, unknown>>(sql,
      "SELECT id, public_url FROM media_assets WHERE id = $1 AND user_id = $2",
      [mediaId, userId]
    );
    if (!asset?.public_url) continue;

    try {
      const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Du bist ein Bildanalyse-Experte. Analysiere das Bild für ein Instagram Media-Archiv. Nutze das Tool.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analysiere dieses Bild:" },
              { type: "image_url", image_url: { url: asset.public_url as string } },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_image",
            description: "Speichert die Bildanalyse",
            parameters: {
              type: "object",
              properties: {
                ai_tags: { type: "array", items: { type: "string" } },
                ai_description: { type: "string" },
                is_selfie: { type: "boolean" },
                ai_usable: { type: "boolean" },
                is_good_reference: { type: "boolean" },
                dalle_persona_prompt: { type: "string" },
                mood: { type: "string" },
              },
              required: ["ai_tags", "ai_description", "is_selfie", "ai_usable"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_image" } },
        max_completion_tokens: 1000,
      });

      const args = extractToolArgs<Record<string, unknown>>(aiResponse, "analyze_image");
      if (args) {
        await query(sql,
          `UPDATE media_assets SET ai_tags = $1, ai_description = $2, is_selfie = $3,
           ai_usable = $4, is_good_reference = $5, dalle_persona_prompt = $6, mood = $7, analyzed = true
           WHERE id = $8`,
          [args.ai_tags, args.ai_description, args.is_selfie, args.ai_usable, args.is_good_reference || false, args.dalle_persona_prompt || null, args.mood || null, mediaId]
        );
        results.push({ id: mediaId, ...args });
      }
    } catch (err) {
      console.error(`[analyze-vision] Error for ${mediaId}:`, err);
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  return c.json({ success: true, analyzed: results.length, results });
});

/** POST /api/media/smart-upload - Process smart upload */
app.post("/smart-upload", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json();
  const { session_id, files, raw_text, collaborators } = body;

  // Create or update upload session
  if (session_id) {
    const existing = await queryOne(sql,
      "SELECT id FROM upload_sessions WHERE session_id = $1 AND user_id = $2",
      [session_id, userId]
    );

    if (existing) {
      await query(sql,
        "UPDATE upload_sessions SET uploaded_files = $1, raw_text = $2, collaborators = $3 WHERE session_id = $4 AND user_id = $5",
        [JSON.stringify(files || []), raw_text || null, collaborators || [], session_id, userId]
      );
    } else {
      await query(sql,
        "INSERT INTO upload_sessions (user_id, session_id, uploaded_files, raw_text, collaborators) VALUES ($1, $2, $3, $4, $5)",
        [userId, session_id, JSON.stringify(files || []), raw_text || null, collaborators || []]
      );
    }
  }

  // Create media_assets entries for uploaded files
  const createdAssets: Array<Record<string, unknown>> = [];
  for (const file of (files || [])) {
    const rows = await query(sql,
      `INSERT INTO media_assets (user_id, storage_path, public_url, filename)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, file.key || file.storage_path, file.publicUrl || file.public_url, file.fileName || file.filename]
    );
    createdAssets.push(rows[0] as Record<string, unknown>);
  }

  return c.json({ success: true, assets: createdAssets });
});

/** POST /api/media/refresh-url - Refresh expired R2 URL */
app.post("/refresh-url", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { media_id, storage_path } = await c.req.json<{
    media_id?: string;
    storage_path?: string;
  }>();

  let path = storage_path;
  if (media_id && !path) {
    const asset = await queryOne<Record<string, unknown>>(sql,
      "SELECT storage_path FROM media_assets WHERE id = $1 AND user_id = $2",
      [media_id, userId]
    );
    path = asset?.storage_path as string;
  }

  if (!path) return c.json({ error: "storage_path required" }, 400);

  const publicUrl = `${c.env.R2_PUBLIC_URL}/${path}`;

  if (media_id) {
    await query(sql, "UPDATE media_assets SET public_url = $1 WHERE id = $2", [publicUrl, media_id]);
  }

  return c.json({ success: true, public_url: publicUrl });
});

/** GET /api/media/content-snippets - List content snippets */
app.get("/content-snippets", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const snippets = await query(sql,
    "SELECT * FROM content_snippets WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
  return c.json(snippets);
});

/** POST /api/media/sync-troupe - Sync Fotos aus Troupe/Picks */
app.post("/sync-troupe", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const troupeUrl = (c.env as unknown as Record<string, string>).TROUPE_SUPABASE_URL;
  const troupeKey = (c.env as unknown as Record<string, string>).TROUPE_SUPABASE_KEY;

  if (!troupeUrl || !troupeKey) {
    return c.json({ error: "Troupe-Verbindung nicht konfiguriert" }, 500);
  }

  const { syncTroupeImages } = await import("../lib/troupe-sync");
  const result = await syncTroupeImages(sql, userId, troupeUrl, troupeKey);

  return c.json({ success: true, ...result });
});

export { app as mediaRoutes };
