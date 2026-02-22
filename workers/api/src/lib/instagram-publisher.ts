import type { NeonQueryFunction } from "@neondatabase/serverless";
import { query, queryOne } from "./db";

interface PublishResult {
  success: boolean;
  ig_media_id?: string;
  error?: string;
}

/**
 * Publish a post to Instagram via Graph API.
 * Used by both the manual /api/instagram/publish route and the scheduler-tick cron.
 */
export async function publishPostToInstagram(
  sql: NeonQueryFunction<false, false>,
  postId: string,
  userId: string,
): Promise<PublishResult> {
  const [post, conn] = await Promise.all([
    queryOne<Record<string, unknown>>(sql,
      "SELECT * FROM posts WHERE id = $1 AND user_id = $2", [postId, userId]),
    queryOne<Record<string, unknown>>(sql,
      "SELECT ig_user_id, token_encrypted FROM meta_connections WHERE user_id = $1", [userId]),
  ]);

  if (!post) return { success: false, error: "Post nicht gefunden" };
  if (!conn?.token_encrypted) return { success: false, error: "Keine Instagram-Verbindung" };

  const token = conn.token_encrypted as string;
  const igUserId = conn.ig_user_id as string;
  const caption = `${post.caption || ""}\n\n${post.hashtags || ""}`.trim();

  const assets = await query<Record<string, unknown>>(sql,
    "SELECT public_url FROM assets WHERE post_id = $1 ORDER BY created_at ASC", [postId]);

  if (assets.length === 0) return { success: false, error: "Keine Medien zum Posten" };

  let igMediaId: string | undefined;

  try {
    if (assets.length === 1 || post.format === "single") {
      // Single image post
      const createRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: assets[0].public_url,
            caption,
            access_token: token,
          }),
        }
      );
      const createData = await createRes.json() as { id?: string; error?: { message: string } };
      if (!createData.id) {
        const errMsg = createData.error?.message || "Container-Erstellung fehlgeschlagen";
        return { success: false, error: errMsg };
      }

      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: createData.id, access_token: token }),
        }
      );
      const publishData = await publishRes.json() as { id?: string; error?: { message: string } };
      igMediaId = publishData.id;
      if (!igMediaId) {
        const errMsg = publishData.error?.message || "Publish fehlgeschlagen";
        return { success: false, error: errMsg };
      }
    } else {
      // Carousel post
      const childIds: string[] = [];
      for (const asset of assets) {
        const childRes = await fetch(
          `https://graph.facebook.com/v21.0/${igUserId}/media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_url: asset.public_url,
              is_carousel_item: true,
              access_token: token,
            }),
          }
        );
        const childData = await childRes.json() as { id?: string };
        if (childData.id) childIds.push(childData.id);
        await new Promise((r) => setTimeout(r, 500));
      }

      const carouselRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media`, {
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
      const carouselData = await carouselRes.json() as { id?: string };

      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: carouselData.id, access_token: token }),
        }
      );
      const publishData = await publishRes.json() as { id?: string };
      igMediaId = publishData.id;
    }

    if (!igMediaId) {
      await query(sql,
        "UPDATE posts SET status = 'FAILED', error_message = 'Publish fehlgeschlagen' WHERE id = $1",
        [postId]);
      return { success: false, error: "Instagram-Veröffentlichung fehlgeschlagen" };
    }

    await query(sql,
      "UPDATE posts SET status = 'PUBLISHED', ig_media_id = $1, published_at = NOW() WHERE id = $2",
      [igMediaId, postId]);

    return { success: true, ig_media_id: igMediaId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await query(sql,
      "UPDATE posts SET status = 'FAILED', error_message = $1 WHERE id = $2",
      [errMsg, postId]);
    return { success: false, error: errMsg };
  }
}
