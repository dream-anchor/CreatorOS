import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";
import { callOpenAI, extractToolArgs } from "../lib/ai";
import { selectBackgroundImage } from "../lib/media-selector";
import { getTemplateHtml, type TemplateData } from "../lib/templates";
import { renderHtmlToImage } from "../lib/image-renderer";
import { formatDateGerman, formatTimeGerman } from "../lib/utils";
import { publishPostToInstagram } from "../lib/instagram-publisher";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// Cron jobs don't use user auth - they process all users
// In production, protect with a secret header

/** POST /api/cron/scheduler-tick - Publish scheduled posts that are due */
app.post("/scheduler-tick", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  const duePosts = await query<{ id: string; user_id: string }>(sql,
    "SELECT id, user_id FROM posts WHERE status = 'SCHEDULED' AND scheduled_at <= NOW()"
  );

  if (duePosts.length === 0) {
    return c.json({ success: true, published: 0, failed: 0, total_due: 0 });
  }

  let published = 0;
  let failed = 0;

  for (const post of duePosts) {
    try {
      console.log(`[scheduler-tick] Publishing post ${post.id} for user ${post.user_id}`);

      const result = await publishPostToInstagram(sql, post.id, post.user_id);

      await query(sql,
        "INSERT INTO logs (user_id, level, event_type, details) VALUES ($1, $2, 'scheduler_tick', $3)",
        [
          post.user_id,
          result.success ? "info" : "error",
          JSON.stringify({
            post_id: post.id,
            success: result.success,
            ig_media_id: result.ig_media_id,
            error: result.error,
          }),
        ]
      );

      if (result.success) {
        published++;
        console.log(`[scheduler-tick] Published post ${post.id} → ig_media_id: ${result.ig_media_id}`);
      } else {
        failed++;
        console.error(`[scheduler-tick] Failed post ${post.id}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      console.error(`[scheduler-tick] Error publishing post ${post.id}:`, err);
      await query(sql,
        "UPDATE posts SET status = 'FAILED', error_message = $1 WHERE id = $2",
        [err instanceof Error ? err.message : String(err), post.id]
      );
    }
  }

  return c.json({ success: true, published, failed, total_due: duePosts.length });
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
        `https://graph.facebook.com/v21.0/${igCommentId}/replies`, {
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
        `https://graph.facebook.com/v21.0/${reply.ig_comment_id}/replies`, {
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

/** POST /api/cron/refresh-tokens - Refresh expiring tokens via Facebook Graph API */
app.post("/refresh-tokens", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  // Find tokens expiring within 7 days
  const expiring = await query<Record<string, unknown>>(sql,
    "SELECT id, user_id, token_encrypted, page_access_token FROM meta_connections WHERE token_expires_at < NOW() + interval '7 days' AND token_encrypted IS NOT NULL"
  );

  let refreshed = 0;
  for (const conn of expiring) {
    try {
      // Page Access Tokens (long-lived) don't expire — mark as refreshed
      if (conn.page_access_token) {
        await query(sql,
          "UPDATE meta_connections SET token_expires_at = NOW() + interval '60 days' WHERE id = $1",
          [conn.id]
        );
        refreshed++;
        continue;
      }

      // Fallback: Facebook long-lived token exchange
      const res = await fetch(
        `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${c.env.INSTAGRAM_APP_ID}&client_secret=${c.env.INSTAGRAM_APP_SECRET}&fb_exchange_token=${conn.token_encrypted}`
      );

      if (res.ok) {
        const data = await res.json() as { access_token: string; expires_in?: number };
        const expiresIn = data.expires_in || 5184000; // 60 days default
        const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

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
        `https://graph.facebook.com/v21.0/${comment.ig_comment_id}/likes`, {
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

// ============================================================
// AUTO-GENERATE EVENT POSTS
// ============================================================

const TEMPLATE_PROMPTS: Record<string, string> = {
  announcement:
    "Erstelle einen Instagram-Ankündigungs-Post für eine Veranstaltung. " +
    "Wecke Vorfreude, nenne Datum, Ort und was die Zuschauer erwartet. " +
    "Wenn ein Ticketlink vorhanden ist, weise darauf hin.",
  countdown:
    "Erstelle einen Countdown-Post (noch 1 Woche!). " +
    "Erzeuge Dringlichkeit, erinnere an den Termin. " +
    "Kurz und knackig.",
  reminder:
    "Erstelle einen Reminder-Post für morgen Abend. " +
    "Letzte Chance für Tickets. Aufregung und Vorfreude. " +
    "Sehr kurz und direkt.",
  thankyou:
    "Erstelle einen Danke-Post nach der Veranstaltung. " +
    "Bedanke dich beim Publikum und der Stadt. " +
    "Mach Lust auf die nächste Vorstellung.",
};

function getRequiredTemplates(daysUntilEvent: number): string[] {
  const templates: string[] = [];
  if (daysUntilEvent <= 14) templates.push("announcement");
  if (daysUntilEvent <= 7) templates.push("countdown");
  if (daysUntilEvent <= 1) templates.push("reminder");
  if (daysUntilEvent < 0) templates.push("thankyou");
  return templates;
}

/** POST /api/cron/auto-generate-event-posts - Automatische Event-Post-Generierung */
app.post("/auto-generate-event-posts", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);

  // 1. Lade alle User mit auto_post_mode != 'off'
  const activeUsers = await query<{ user_id: string; auto_post_mode: string }>(sql,
    "SELECT user_id, auto_post_mode FROM settings WHERE auto_post_mode IS NOT NULL AND auto_post_mode != 'off'"
  );

  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const userSetting of activeUsers) {
    const userId = userSetting.user_id;

    try {
      // 2. Lade aktive Events: nächste 30 Tage + gestern (für Danke-Posts)
      const events = await query<Record<string, unknown>>(sql,
        `SELECT * FROM events
         WHERE user_id = $1 AND is_active = true
           AND date BETWEEN (CURRENT_DATE - interval '1 day') AND (CURRENT_DATE + interval '30 days')
         ORDER BY date ASC`,
        [userId]
      );

      if (events.length === 0) continue;

      // 3. Lade bereits generierte Posts mit event_id + auto_template
      const existingPosts = await query<{ event_id: string; auto_template: string }>(sql,
        `SELECT event_id, auto_template FROM posts
         WHERE user_id = $1 AND event_id IS NOT NULL AND auto_template IS NOT NULL`,
        [userId]
      );

      const existingSet = new Set(
        existingPosts.map((p) => `${p.event_id}:${p.auto_template}`)
      );

      // 4. Finde den ersten fehlenden Post (max 1 pro User pro Durchlauf)
      let generatedForUser = false;

      for (const event of events) {
        if (generatedForUser) break;

        const eventDate = new Date(event.date as string);
        const now = new Date();
        const daysUntil = Math.floor(
          (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        const requiredTemplates = getRequiredTemplates(daysUntil);

        for (const template of requiredTemplates) {
          if (generatedForUser) break;
          if (existingSet.has(`${event.id}:${template}`)) continue;

          // 5. Lade brand_rules
          const brandRules = await queryOne<Record<string, unknown>>(sql,
            "SELECT * FROM brand_rules WHERE user_id = $1",
            [userId]
          );

          const br = brandRules;
          const model = (br?.ai_model as string) || "gpt-4o";

          let systemPrompt = (br?.style_system_prompt as string) || "";
          if (!systemPrompt) {
            systemPrompt = `Du bist ein Instagram-Ghostwriter. Tonalität: ${br?.tone_style || "freundlich"}. Sprache: ${br?.language_primary || "DE"}.`;
          }

          const templatePrompt = TEMPLATE_PROMPTS[template];

          // Event-Kontext für den User-Prompt
          const castStr = (event.cast_members as string[])?.length
            ? `Cast: ${(event.cast_members as string[]).join(", ")}`
            : "";
          const ticketStr = event.ticket_url
            ? `Tickets: ${event.ticket_url}`
            : "";

          const eventContext = [
            `Event: ${event.title}`,
            `Datum: ${event.date} um ${event.time || "20:00"}`,
            `Ort: ${event.venue}, ${event.city}`,
            event.description ? `Beschreibung: ${event.description}` : "",
            castStr,
            ticketStr,
          ]
            .filter(Boolean)
            .join("\n");

          // 6. AI-Aufruf
          const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
            model,
            messages: [
              { role: "system", content: systemPrompt + "\n\n" + templatePrompt },
              { role: "user", content: eventContext },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "create_event_post",
                  description: "Erstellt einen Instagram-Post-Entwurf für ein Event",
                  parameters: {
                    type: "object",
                    properties: {
                      caption: { type: "string", description: "Instagram Caption" },
                      hashtags: { type: "string", description: "Relevante Hashtags" },
                      alt_text: { type: "string", description: "Bildbeschreibung" },
                    },
                    required: ["caption", "hashtags"],
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "create_event_post" } },
            max_completion_tokens: 1000,
          });

          const args = extractToolArgs<{
            caption: string;
            hashtags: string;
            alt_text?: string;
          }>(aiResponse, "create_event_post");

          if (!args) {
            errors++;
            continue;
          }

          // ── IMAGE GENERATION PIPELINE ──
          let imagePublicUrl: string | null = null;
          let imageR2Key: string | null = null;
          let imageMediaAssetId: string | null = null;

          try {
            const bgImage = await selectBackgroundImage(
              sql,
              userId,
              template,
              (event.image_pool_tags as string[]) || []
            );

            if (bgImage) {
              imageMediaAssetId = bgImage.id;

              const templateData: TemplateData = {
                eventTitle: event.title as string,
                dateFormatted: formatDateGerman(event.date as string),
                timeFormatted: formatTimeGerman(event.time as string | null),
                venue: event.venue as string,
                city: event.city as string,
                backgroundImageUrl: bgImage.public_url,
                daysUntil,
                ticketUrl: (event.ticket_url as string) || undefined,
              };

              const html = getTemplateHtml(template, templateData);
              const pngBuffer = await renderHtmlToImage(c.env, html);

              if (pngBuffer) {
                const r2Key = `event-images/${userId}/${event.id}/${template}-${Date.now()}.png`;
                await c.env.R2_BUCKET.put(r2Key, pngBuffer, {
                  httpMetadata: { contentType: "image/png" },
                });
                imageR2Key = r2Key;
                imagePublicUrl = `${c.env.R2_PUBLIC_URL}/${r2Key}`;
              }
            }
          } catch (imgErr) {
            console.error(`[auto-generate] Image gen failed for ${event.id}/${template}:`, imgErr);
          }

          // 7. Post-Status basierend auf auto_post_mode
          let postStatus: string;
          let scheduledAt: string | null = null;

          switch (userSetting.auto_post_mode) {
            case "draft":
              postStatus = "DRAFT";
              break;
            case "review":
              postStatus = "READY_FOR_REVIEW";
              break;
            case "auto":
              postStatus = "SCHEDULED";
              scheduledAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
              break;
            default:
              postStatus = "DRAFT";
          }

          // 8. Post erstellen
          const postRows = await query<{ id: string }>(sql,
            `INSERT INTO posts (user_id, status, caption, hashtags, alt_text, format, event_id, auto_template, scheduled_at)
             VALUES ($1, $2, $3, $4, $5, 'single', $6, $7, $8)
             RETURNING id`,
            [
              userId,
              postStatus,
              args.caption,
              args.hashtags,
              args.alt_text || null,
              event.id,
              template,
              scheduledAt,
            ]
          );

          // 9. Asset anlegen (wenn Bild generiert)
          if (imagePublicUrl && imageR2Key && postRows[0]?.id) {
            await query(sql,
              `INSERT INTO assets (user_id, post_id, storage_path, public_url, width, height, source, generator_meta)
               VALUES ($1, $2, $3, $4, 1080, 1080, 'generate', $5)`,
              [
                userId,
                postRows[0].id,
                imageR2Key,
                imagePublicUrl,
                JSON.stringify({
                  type: "event_template",
                  template,
                  event_id: event.id,
                  background_media_asset_id: imageMediaAssetId,
                }),
              ]
            );
          }

          // 10. Log
          await query(sql,
            "INSERT INTO logs (user_id, level, event_type, details) VALUES ($1, 'info', 'event_post_generated', $2)",
            [
              userId,
              JSON.stringify({
                event_id: event.id,
                post_id: postRows[0]?.id,
                template,
                model,
                status: postStatus,
                has_image: !!imagePublicUrl,
                image_url: imagePublicUrl,
                background_media_asset_id: imageMediaAssetId,
              }),
            ]
          );

          generated++;
          generatedForUser = true;
        }
      }

      if (!generatedForUser) skipped++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await query(sql,
        "INSERT INTO logs (user_id, level, event_type, details) VALUES ($1, 'error', 'event_post_generation_failed', $2)",
        [userId, JSON.stringify({ error: msg })]
      ).catch(() => {});
      errors++;
    }
  }

  return c.json({
    success: true,
    users_processed: activeUsers.length,
    generated,
    skipped,
    errors,
  });
});

export { app as cronRoutes };
