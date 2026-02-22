import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** GET /api/analytics/stats - Get daily account stats */
app.get("/stats", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const days = parseInt(c.req.query("days") || "30");

  const stats = await query(sql,
    `SELECT * FROM daily_account_stats
     WHERE user_id = $1 AND date >= CURRENT_DATE - $2::int
     ORDER BY date DESC`,
    [userId, days]
  );

  return c.json(stats);
});

/** POST /api/analytics/fetch-daily-insights - Fetch from Instagram API */
app.post("/fetch-daily-insights", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const conn = await queryOne<Record<string, unknown>>(sql,
    "SELECT ig_user_id, token_encrypted FROM meta_connections WHERE user_id = $1", [userId]);
  if (!conn?.token_encrypted) return c.json({ error: "Keine Instagram-Verbindung" }, 400);

  const token = conn.token_encrypted as string;
  const igUserId = conn.ig_user_id as string;

  // Fetch follower count
  const profileRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count,media_count&access_token=${token}`
  );
  const profileData = await profileRes.json() as Record<string, number>;

  // Fetch insights
  const insightsRes = await fetch(
    `https://graph.facebook.com/v21.0/${igUserId}/insights?metric=impressions,reach,profile_views,accounts_engaged,likes,comments,shares,saves&period=day&access_token=${token}`
  );

  let insightsData: { data: Array<Record<string, unknown>> } = { data: [] };
  if (insightsRes.ok) {
    insightsData = await insightsRes.json() as typeof insightsData;
  }

  const getMetricValue = (name: string) => {
    const metric = insightsData.data.find((m) => m.name === name);
    const values = (metric?.values as Array<{ value: number }>) || [];
    return values[0]?.value || 0;
  };

  const today = new Date().toISOString().split("T")[0];

  // Get previous day's follower count for delta
  const prevStats = await queryOne<Record<string, unknown>>(sql,
    "SELECT follower_count FROM daily_account_stats WHERE user_id = $1 AND date < $2 ORDER BY date DESC LIMIT 1",
    [userId, today]
  );
  const followerDelta = profileData.followers_count - ((prevStats?.follower_count as number) || profileData.followers_count);

  // Upsert daily stats
  await query(sql,
    `INSERT INTO daily_account_stats (user_id, date, follower_count, impressions_day, reach_day,
     profile_views, accounts_engaged, likes_day, comments_day, shares_day, saves_day,
     follower_delta, posts_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (user_id, date) DO UPDATE SET
       follower_count = EXCLUDED.follower_count,
       impressions_day = EXCLUDED.impressions_day,
       reach_day = EXCLUDED.reach_day,
       profile_views = EXCLUDED.profile_views,
       accounts_engaged = EXCLUDED.accounts_engaged,
       likes_day = EXCLUDED.likes_day,
       comments_day = EXCLUDED.comments_day,
       shares_day = EXCLUDED.shares_day,
       saves_day = EXCLUDED.saves_day,
       follower_delta = EXCLUDED.follower_delta,
       posts_count = EXCLUDED.posts_count`,
    [
      userId, today,
      profileData.followers_count || 0,
      getMetricValue("impressions"),
      getMetricValue("reach"),
      getMetricValue("profile_views"),
      getMetricValue("accounts_engaged"),
      getMetricValue("likes"),
      getMetricValue("comments"),
      getMetricValue("shares"),
      getMetricValue("saves"),
      followerDelta,
      profileData.media_count || 0,
    ]
  );

  return c.json({
    success: true,
    date: today,
    follower_count: profileData.followers_count,
    follower_delta: followerDelta,
  });
});

/** GET /api/analytics/top-posts - Get top performing posts */
app.get("/top-posts", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const metric = c.req.query("metric") || "engagement_rate";
  const limit = parseInt(c.req.query("limit") || "10");

  const validMetrics = ["engagement_rate", "likes_count", "reach_count", "impressions_count", "comments_count"];
  const orderBy = validMetrics.includes(metric) ? metric : "engagement_rate";

  const posts = await query(sql,
    `SELECT id, caption, category, mood, format, published_at,
       likes_count, comments_count, saved_count, impressions_count, reach_count, engagement_rate
     FROM posts
     WHERE user_id = $1 AND is_imported = true
     ORDER BY ${orderBy} DESC NULLS LAST
     LIMIT $2`,
    [userId, limit]
  );

  return c.json(posts);
});

export { app as analyticsRoutes };
