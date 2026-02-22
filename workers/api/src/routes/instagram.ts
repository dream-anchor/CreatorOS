import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { publishPostToInstagram } from "../lib/instagram-publisher";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// Auth for all routes except callbacks
app.use("/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.endsWith("/callback") || path.endsWith("/oauth-config")) return next();
  // Auth handled by global middleware
  return next();
});

/** POST /api/instagram/auth - Exchange OAuth code for token (Facebook Login → IG Business) */
app.post("/auth", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{
    code?: string;
    redirect_uri?: string;
    action?: string;
    selected_account?: {
      ig_user_id: string;
      ig_username: string;
      profile_picture_url?: string;
      page_id: string;
      page_name: string;
      page_access_token: string;
      token_expires_at?: string;
    };
  }>();

  // ── Account-Selection (Step 2: User hat Account gewählt) ──
  if (body.action === "select_account" && body.selected_account) {
    const acc = body.selected_account;
    const expiresAt = acc.token_expires_at || new Date(Date.now() + 5184000 * 1000).toISOString();

    const existing = await queryOne(sql, "SELECT id FROM meta_connections WHERE user_id = $1", [userId]);
    if (existing) {
      await query(sql,
        `UPDATE meta_connections SET ig_user_id = $1, ig_username = $2, token_encrypted = $3,
         token_expires_at = $4, profile_picture_url = $5, page_id = $6, page_name = $7, connected_at = NOW()
         WHERE user_id = $8`,
        [acc.ig_user_id, acc.ig_username, acc.page_access_token, expiresAt,
         acc.profile_picture_url || null, acc.page_id, acc.page_name, userId]
      );
    } else {
      await query(sql,
        `INSERT INTO meta_connections (user_id, ig_user_id, ig_username, token_encrypted, token_expires_at, profile_picture_url, page_id, page_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [userId, acc.ig_user_id, acc.ig_username, acc.page_access_token, expiresAt,
         acc.profile_picture_url || null, acc.page_id, acc.page_name]
      );
    }

    await query(sql,
      "INSERT INTO logs (user_id, level, event_type, details) VALUES ($1, 'info', 'instagram_connected', $2)",
      [userId, JSON.stringify({ ig_username: acc.ig_username, page_name: acc.page_name })]
    );

    return c.json({ success: true, ig_username: acc.ig_username, profile_picture_url: acc.profile_picture_url });
  }

  // ── Token-Exchange (Step 1: Code von Facebook Login) ──
  const { code, redirect_uri } = body;
  if (!code) return c.json({ error: "Code fehlt" }, 400);

  // 1. Exchange code for short-lived token (Facebook Graph API)
  const tokenRes = await fetch("https://graph.facebook.com/v20.0/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.INSTAGRAM_APP_ID,
      client_secret: c.env.INSTAGRAM_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: redirect_uri || "",
      code,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return c.json({ error: `Token-Austausch fehlgeschlagen: ${err}`, success: false }, 500);
  }

  const tokenData = await tokenRes.json() as { access_token: string; user_id: string };

  // 2. Exchange for long-lived token (Facebook Graph API)
  const longLivedRes = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${c.env.INSTAGRAM_APP_ID}&client_secret=${c.env.INSTAGRAM_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`
  );

  const longLivedData = await longLivedRes.json() as { access_token: string; expires_in: number };
  const longLivedToken = longLivedData.access_token || tokenData.access_token;
  const expiresAt = new Date(Date.now() + (longLivedData.expires_in || 5184000) * 1000).toISOString();

  // 3. Get Facebook Pages the user manages
  const pagesRes = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?access_token=${longLivedToken}`
  );

  if (!pagesRes.ok) {
    const err = await pagesRes.text();
    return c.json({ error: `Pages-Abfrage fehlgeschlagen: ${err}`, success: false }, 500);
  }

  const pagesData = await pagesRes.json() as {
    data: Array<{ id: string; name: string; access_token: string }>;
  };

  if (!pagesData.data || pagesData.data.length === 0) {
    return c.json({
      error: "Keine Facebook-Seiten gefunden. Dein Account braucht eine Facebook-Seite mit verknüpftem Instagram Business Account.",
      success: false,
    }, 400);
  }

  // 4. For each page, find linked Instagram Business Account
  const accounts: Array<{
    ig_user_id: string;
    ig_username: string;
    profile_picture_url?: string;
    page_id: string;
    page_name: string;
    page_access_token: string;
  }> = [];

  for (const page of pagesData.data) {
    const igRes = await fetch(
      `https://graph.facebook.com/v20.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
    );
    const igData = await igRes.json() as { instagram_business_account?: { id: string } };

    if (igData.instagram_business_account?.id) {
      const igUserRes = await fetch(
        `https://graph.facebook.com/v20.0/${igData.instagram_business_account.id}?fields=username,profile_picture_url&access_token=${page.access_token}`
      );
      const igUserData = await igUserRes.json() as { username?: string; profile_picture_url?: string };

      accounts.push({
        ig_user_id: igData.instagram_business_account.id,
        ig_username: igUserData.username || "unknown",
        profile_picture_url: igUserData.profile_picture_url,
        page_id: page.id,
        page_name: page.name,
        page_access_token: page.access_token,
      });
    }
  }

  if (accounts.length === 0) {
    return c.json({
      error: "Kein Instagram Business Account gefunden. Verknüpfe deinen Instagram Account als Business-Profil mit einer Facebook-Seite.",
      success: false,
    }, 400);
  }

  // Return accounts for selection
  return c.json({
    success: true,
    action: "select_account",
    accounts,
    token_expires_at: expiresAt,
  });
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
  const scopes = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_insights,pages_show_list,pages_read_engagement,business_management";

  const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${c.env.INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${encodeURIComponent(state)}`;

  return c.json({ authUrl, redirectUri });
});

/** POST /api/instagram/publish - Publish post to Instagram */
app.post("/publish", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { post_id } = await c.req.json<{ post_id: string }>();

  const result = await publishPostToInstagram(sql, post_id, userId);

  if (!result.success) {
    return c.json({ error: result.error }, result.error === "Post nicht gefunden" ? 404 : 500);
  }

  return c.json({ success: true, ig_media_id: result.ig_media_id });
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

  let url = `https://graph.facebook.com/v21.0/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count&limit=${limit}&access_token=${token}`;
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
    `https://graph.facebook.com/v21.0/me?fields=id,username&access_token=${conn.token_encrypted}`
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
    `https://graph.facebook.com/v21.0/${conn.ig_user_id}?fields=business_discovery.fields(id,username,name,profile_picture_url).username(${username})&access_token=${conn.token_encrypted}`
  );

  if (!res.ok) return c.json({ valid: false });

  const data = await res.json() as { business_discovery?: Record<string, string> };
  return c.json({
    valid: !!data.business_discovery,
    user: data.business_discovery || null,
  });
});

export { app as instagramRoutes };
