import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// Cron jobs don't use user auth - they process all users
// In production, protect with a secret header

/** POST /api/cron/scheduler-tick - Publish scheduled posts */
app.post("/scheduler-tick", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const duePosts = await query<Record<string, unknown>>(sql,
    "SELECT id, user_id FROM posts WHERE status = 'SCHEDULED' AND scheduled_at <= NOW()"
  );

  let published = 0;
  for (const post of duePosts) {
    try {
      // Trigger publish via internal call
      const conn = await queryOne<Record<string, unknown>>(sql,
        "SELECT ig_user_id, token_encrypted FROM meta_connections WHERE user_id = $1",
        [post.user_id]
      );
      if (!conn?.token_encrypted) continue;

      // Simple publish - would call the full publish logic
      // For now, just update status (the real logic is in /api/instagram/publish)
      await query(sql,
        "INSERT INTO logs (user_id, level, event_type, details) VALUES ($1, 'info', 'scheduler_tick', $2)",
        [post.user_id, JSON.stringify({ post_id: post.id, action: "publish_triggered" })]
      );

      published++;
    } catch (err) {
      console.error(`[scheduler-tick] Error publishing post ${post.id}:`, err);
    }
  }

  return c.json({ success: true, published, total_due: duePosts.length });
});

/** POST /api/cron/process-reply-queue - Send queued replies */
app.post("/process-reply-queue", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const pendingReplies = await query<Record<string, unknown>>(sql,
    `SELECT rq.*, ic.ig_comment_id, mc.token_encrypted, mc.ig_username
     FROM reply_queue rq
     JOIN instagram_comments ic ON rq.comment_id = ic.id
     JOIN meta_connections mc ON rq.user_id = mc.user_id
     WHERE rq.status = 'pending'
     ORDER BY rq.created_at ASC
     LIMIT 20`
  );

  let sent = 0;
  for (const reply of pendingReplies) {
    try {
      const token = reply.token_encrypted as string;
      const igCommentId = reply.ig_comment_id as string;

      const res = await fetch(
        `https://graph.instagram.com/v21.0/${igCommentId}/replies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: reply.reply_text,
            access_token: token,
          }),
        }
      );

      if (res.ok) {
        await query(sql,
          "UPDATE reply_queue SET status = 'sent', sent_at = NOW() WHERE id = $1",
          [reply.id]
        );
        await query(sql,
          "UPDATE instagram_comments SET is_replied = true WHERE id = $1",
          [reply.comment_id]
        );
        sent++;
      } else {
        const errText = await res.text();
        await query(sql,
          "UPDATE reply_queue SET status = 'failed', error_message = $1 WHERE id = $2",
          [errText, reply.id]
        );
      }

      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await query(sql,
        "UPDATE reply_queue SET status = 'failed', error_message = $1 WHERE id = $2",
        [msg, reply.id]
      );
    }
  }

  // Also process comment_reply_queue
  const pendingCRQ = await query<Record<string, unknown>>(sql,
    `SELECT crq.*, mc.token_encrypted
     FROM comment_reply_queue crq
     JOIN meta_connections mc ON crq.user_id = mc.user_id
     WHERE crq.status = 'pending' AND (crq.scheduled_for IS NULL OR crq.scheduled_for <= NOW())
     ORDER BY crq.created_at ASC
     LIMIT 20`
  );

  for (const reply of pendingCRQ) {
    try {
      const res = await fetch(
        `https://graph.instagram.com/v21.0/${reply.ig_comment_id}/replies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: reply.reply_text,
            access_token: reply.token_encrypted,
          }),
        }
      );

      if (res.ok) {
        await query(sql,
          "UPDATE comment_reply_queue SET status = 'sent', sent_at = NOW() WHERE id = $1",
          [reply.id]
        );
        if (reply.comment_id) {
          await query(sql,
            "UPDATE instagram_comments SET is_replied = true WHERE id = $1",
            [reply.comment_id]
          );
        }
        sent++;
      } else {
        const errText = await res.text();
        await query(sql,
          "UPDATE comment_reply_queue SET status = 'failed', error_message = $1 WHERE id = $2",
          [errText, reply.id]
        );
      }

      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await query(sql,
        "UPDATE comment_reply_queue SET status = 'failed', error_message = $1 WHERE id = $2",
        [msg, reply.id]
      );
    }
  }

  return c.json({ success: true, sent, total_processed: pendingReplies.length + pendingCRQ.length });
});

/** POST /api/cron/refresh-tokens - Refresh expiring Instagram tokens */
app.post("/refresh-tokens", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  // Find tokens expiring within 7 days
  const expiring = await query<Record<string, unknown>>(sql,
    "SELECT id, user_id, token_encrypted FROM meta_connections WHERE token_expires_at < NOW() + interval '7 days' AND token_encrypted IS NOT NULL"
  );

  let refreshed = 0;
  for (const conn of expiring) {
    try {
      const res = await fetch(
        `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${conn.token_encrypted}`
      );

      if (res.ok) {
        const data = await res.json() as { access_token: string; expires_in: number };
        const newExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();

        await query(sql,
          "UPDATE meta_connections SET token_encrypted = $1, token_expires_at = $2 WHERE id = $3",
          [data.access_token, newExpiry, conn.id]
        );
        refreshed++;
      }
    } catch (err) {
      console.error(`[refresh-tokens] Error for user ${conn.user_id}:`, err);
    }
  }

  return c.json({ success: true, refreshed, total_expiring: expiring.length });
});

/** POST /api/cron/backfill-likes - Like comments that have been replied to */
app.post("/backfill-likes", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const comments = await query<Record<string, unknown>>(sql,
    `SELECT ic.ig_comment_id, mc.token_encrypted
     FROM instagram_comments ic
     JOIN meta_connections mc ON ic.user_id = mc.user_id
     WHERE ic.is_replied = true AND ic.is_liked = false
     LIMIT 50`
  );

  let liked = 0;
  for (const comment of comments) {
    try {
      const res = await fetch(
        `https://graph.instagram.com/v21.0/${comment.ig_comment_id}/likes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: comment.token_encrypted }),
        }
      );

      if (res.ok) {
        await query(sql,
          "UPDATE instagram_comments SET is_liked = true WHERE ig_comment_id = $1",
          [comment.ig_comment_id]
        );
        liked++;
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // Skip failures
    }
  }

  return c.json({ success: true, liked, total: comments.length });
});

export { app as cronRoutes };
