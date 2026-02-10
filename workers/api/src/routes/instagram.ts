import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";
import { authMiddleware } from "../middleware/auth";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// Auth for all routes except callbacks
app.use("/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.endsWith("/callback") || path.endsWith("/oauth-config")) return next();
  // Auth handled by global middleware
  return next();
});

/** POST /api/instagram/auth - Exchange OAuth code for token */
app.post("/auth", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { code, redirect_uri } = await c.req.json<{ code: string; redirect_uri: string }>();

  if (!code) return c.json({ error: "Code fehlt" }, 400);

  // Exchange code for short-lived token
  const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.INSTAGRAM_APP_ID,
      client_secret: c.env.INSTAGRAM_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri,
      code,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return c.json({ error: `Token-Austausch fehlgeschlagen: ${err}`, success: false }, 500);
  }

  const tokenData = await tokenRes.json() as { access_token: string; user_id: string };

  // Exchange for long-lived token
  const longLivedRes = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${c.env.INSTAGRAM_APP_SECRET}&access_token=${tokenData.access_token}`
  );

  const longLivedData = await longLivedRes.json() as { access_token: string; expires_in: number };
  const token = longLivedData.access_token || tokenData.access_token;
  const expiresAt = new Date(Date.now() + (longLivedData.expires_in || 5184000) * 1000).toISOString();

  // Get Instagram user info
  const userRes = await fetch(
    `https://graph.instagram.com/v21.0/me?fields=id,username,name,profile_picture_url,account_type&access_token=${token}`
  );
  const userData = await userRes.json() as Record<string, string>;

  // Upsert meta_connections
  const existing = await queryOne(sql, "SELECT id FROM meta_connections WHERE user_id = $1", [userId]);
  if (existing) {
    await query(sql,
      `UPDATE meta_connections SET ig_user_id = $1, ig_username = $2, token_encrypted = $3,
       token_expires_at = $4, profile_picture_url = $5, connected_at = NOW() WHERE user_id = $6`,
      [userData.id, userData.username, token, expiresAt, userData.profile_picture_url, userId]
    );
  } else {
    await query(sql,
      `INSERT INTO meta_connections (user_id, ig_user_id, ig_username, token_encrypted, token_expires_at, profile_picture_url)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, userData.id, userData.username, token, expiresAt, userData.profile_picture_url]
    );
  }

  await query(sql,
    "INSERT INTO logs (user_id, level, event_type, details) VALUES ($1, 'info', 'instagram_connected', $2)",
    [userId, JSON.stringify({ ig_username: userData.username })]
  );

  return c.json({ success: true, ig_username: userData.username, profile_picture_url: userData.profile_picture_url });
});

/** GET /api/instagram/callback - OAuth callback (redirect) */
app.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code) {
    return c.html("<html><body><h1>Fehler</h1><p>Kein Auth-Code erhalten.</p></body></html>");
  }

  // Redirect to frontend with code
  const frontendUrl = state || "https://creatoros.de";
  return c.redirect(`${frontendUrl}/auth/callback?code=${code}`);
});

/** GET /api/instagram/oauth-config - Get OAuth URL */
app.get("/oauth-config", async (c) => {
  const redirectUri = c.req.query("redirect_uri") || `${new URL(c.req.url).origin}/api/instagram/callback`;
  const state = c.req.query("state") || "";

  const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${c.env.INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights,pages_show_list,pages_read_engagement&response_type=code&state=${encodeURIComponent(state)}`;

  return c.json({ authUrl, redirectUri });
});

/** POST /api/instagram/publish - Publish post to Instagram */
app.post("/publish", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { post_id } = await c.req.json<{ post_id: string }>();

  const [post, conn] = await Promise.all([
    queryOne<Record<string, unknown>>(sql,
      "SELECT * FROM posts WHERE id = $1 AND user_id = $2", [post_id, userId]),
    queryOne<Record<string, unknown>>(sql,
      "SELECT ig_user_id, token_encrypted FROM meta_connections WHERE user_id = $1", [userId]),
  ]);

  if (!post) return c.json({ error: "Post nicht gefunden" }, 404);
  if (!conn?.token_encrypted) return c.json({ error: "Keine Instagram-Verbindung" }, 400);

  const token = conn.token_encrypted as string;
  const igUserId = conn.ig_user_id as string;
  const caption = `${post.caption || ""}\n\n${post.hashtags || ""}`.trim();

  // Get assets
  const assets = await query<Record<string, unknown>>(sql,
    "SELECT public_url FROM assets WHERE post_id = $1 ORDER BY created_at ASC", [post_id]);

  if (assets.length === 0) return c.json({ error: "Keine Medien zum Posten" }, 400);

  let igMediaId: string;

  if (assets.length === 1 || post.format === "single") {
    // Single image post
    const createRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: assets[0].public_url,
          caption,
          access_token: token,
        }),
      }
    );
    const createData = await createRes.json() as { id: string };
    if (!createData.id) return c.json({ error: "Container-Erstellung fehlgeschlagen" }, 500);

    // Publish
    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: createData.id, access_token: token }),
      }
    );
    const publishData = await publishRes.json() as { id: string };
    igMediaId = publishData.id;
  } else {
    // Carousel post
    const childIds: string[] = [];
    for (const asset of assets) {
      const childRes = await fetch(
        `https://graph.instagram.com/v21.0/${igUserId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: asset.public_url,
            is_carousel_item: true,
            access_token: token,
          }),
        }
      );
      const childData = await childRes.json() as { id: string };
      if (childData.id) childIds.push(childData.id);
      await new Promise((r) => setTimeout(r, 500));
    }

    const carouselRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: childIds,
          caption,
          access_token: token,
        }),
      }
    );
    const carouselData = await carouselRes.json() as { id: string };

    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: carouselData.id, access_token: token }),
      }
    );
    const publishData = await publishRes.json() as { id: string };
    igMediaId = publishData.id;
  }

  if (!igMediaId) {
    await query(sql, "UPDATE posts SET status = 'FAILED', error_message = 'Publish fehlgeschlagen' WHERE id = $1", [post_id]);
    return c.json({ error: "Instagram-Veröffentlichung fehlgeschlagen" }, 500);
  }

  await query(sql,
    "UPDATE posts SET status = 'PUBLISHED', ig_media_id = $1, published_at = NOW() WHERE id = $2",
    [igMediaId, post_id]
  );

  return c.json({ success: true, ig_media_id: igMediaId });
});

/** POST /api/instagram/fetch-history - Import Instagram post history */
app.post("/fetch-history", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { after_cursor, limit = 50 } = await c.req.json<{ after_cursor?: string; limit?: number }>();

  const conn = await queryOne<Record<string, unknown>>(sql,
    "SELECT ig_user_id, token_encrypted FROM meta_connections WHERE user_id = $1", [userId]);
  if (!conn?.token_encrypted) return c.json({ error: "Keine Instagram-Verbindung" }, 400);

  const token = conn.token_encrypted as string;
  const igUserId = conn.ig_user_id as string;

  let url = `https://graph.instagram.com/v21.0/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count&limit=${limit}&access_token=${token}`;
  if (after_cursor) url += `&after=${after_cursor}`;

  const res = await fetch(url);
  if (!res.ok) return c.json({ error: `Instagram API Fehler: ${res.status}` }, 500);

  const data = await res.json() as {
    data: Array<Record<string, unknown>>;
    paging?: { cursors?: { after?: string }; next?: string };
  };

  let imported = 0;
  for (const media of data.data) {
    // Check if already imported
    const existing = await queryOne(sql,
      "SELECT id FROM posts WHERE ig_media_id = $1", [media.id]);
    if (existing) continue;

    await query(sql,
      `INSERT INTO posts (user_id, status, caption, ig_media_id, published_at, is_imported, original_ig_permalink, original_media_url,
       likes_count, comments_count, format)
       VALUES ($1, 'PUBLISHED', $2, $3, $4, true, $5, $6, $7, $8, $9)`,
      [
        userId,
        media.caption || null,
        media.id,
        media.timestamp,
        media.permalink,
        media.media_url || media.thumbnail_url,
        media.like_count || 0,
        media.comments_count || 0,
        media.media_type === "CAROUSEL_ALBUM" ? "carousel" : media.media_type === "VIDEO" ? "reel" : "single",
      ]
    );
    imported++;
  }

  const nextCursor = data.paging?.cursors?.after;
  const hasMore = !!data.paging?.next;

  await query(sql, "UPDATE settings SET last_sync_at = NOW() WHERE user_id = $1", [userId]);

  return c.json({ success: true, imported, total_fetched: data.data.length, next_cursor: nextCursor, has_more: hasMore });
});

/** POST /api/instagram/store-token - Store Instagram token */
app.post("/store-token", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { ig_user_id, access_token } = await c.req.json<{ ig_user_id: string; access_token: string }>();

  const existing = await queryOne(sql, "SELECT id FROM meta_connections WHERE user_id = $1", [userId]);
  if (existing) {
    await query(sql,
      "UPDATE meta_connections SET ig_user_id = $1, token_encrypted = $2, connected_at = NOW() WHERE user_id = $3",
      [ig_user_id, access_token, userId]
    );
  } else {
    await query(sql,
      "INSERT INTO meta_connections (user_id, ig_user_id, token_encrypted) VALUES ($1, $2, $3)",
      [userId, ig_user_id, access_token]
    );
  }

  return c.json({ success: true });
});

/** POST /api/instagram/test-connection - Test Instagram connection */
app.post("/test-connection", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const conn = await queryOne<Record<string, unknown>>(sql,
    "SELECT token_encrypted FROM meta_connections WHERE user_id = $1", [userId]);
  if (!conn?.token_encrypted) return c.json({ error: "Keine Verbindung" }, 400);

  const res = await fetch(
    `https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${conn.token_encrypted}`
  );

  if (!res.ok) return c.json({ success: false, error: `API Fehler: ${res.status}` });

  const data = await res.json();
  return c.json({ success: true, data });
});

/** POST /api/instagram/validate-user - Validate Instagram username */
app.post("/validate-user", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { username } = await c.req.json<{ username: string }>();

  const conn = await queryOne<Record<string, unknown>>(sql,
    "SELECT ig_user_id, token_encrypted FROM meta_connections WHERE user_id = $1", [userId]);
  if (!conn?.token_encrypted) return c.json({ error: "Keine Verbindung" }, 400);

  const res = await fetch(
    `https://graph.instagram.com/v21.0/${conn.ig_user_id}?fields=business_discovery.fields(id,username,name,profile_picture_url).username(${username})&access_token=${conn.token_encrypted}`
  );

  if (!res.ok) return c.json({ valid: false });

  const data = await res.json() as { business_discovery?: Record<string, string> };
  return c.json({
    valid: !!data.business_discovery,
    user: data.business_discovery || null,
  });
});

export { app as instagramRoutes };
