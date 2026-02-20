import type { NeonQueryFunction } from "@neondatabase/serverless";
import { query } from "./db";

const TEMPLATE_TAG_PREFERENCES: Record<string, string[]> = {
  announcement: ["cast", "portrait", "promo", "group", "bühne"],
  countdown: ["bühne", "stage", "performance", "live", "atmosphäre"],
  reminder: ["atmosphäre", "audience", "venue", "detail", "bühne"],
  thankyou: ["publikum", "audience", "applaus", "crowd", "group"],
};

export interface SelectedImage {
  id: string;
  public_url: string;
}

/**
 * Wählt ein passendes Hintergrundbild aus dem media_assets Pool.
 * Strategie: Event-Tags → Template-Tags → Fallback (beliebig ai_usable).
 * Bevorzugt wenig genutzte Bilder (used_count ASC).
 */
export async function selectBackgroundImage(
  sql: NeonQueryFunction<false, false>,
  userId: string,
  template: string,
  eventImagePoolTags?: string[]
): Promise<SelectedImage | null> {
  // 1. Event-spezifische Tags oder Template-Tags
  const preferredTags =
    eventImagePoolTags && eventImagePoolTags.length > 0
      ? eventImagePoolTags
      : TEMPLATE_TAG_PREFERENCES[template] || [];

  if (preferredTags.length > 0) {
    const tagMatched = await query<SelectedImage>(
      sql,
      `SELECT id, public_url FROM media_assets
       WHERE user_id = $1
         AND ai_usable = true
         AND public_url IS NOT NULL
         AND ai_tags && $2::text[]
       ORDER BY used_count ASC, last_used_at ASC NULLS FIRST
       LIMIT 1`,
      [userId, preferredTags]
    );

    if (tagMatched.length > 0) {
      await markUsed(sql, tagMatched[0].id);
      return tagMatched[0];
    }
  }

  // 2. Fallback: beliebiges ai_usable Bild
  const fallback = await query<SelectedImage>(
    sql,
    `SELECT id, public_url FROM media_assets
     WHERE user_id = $1
       AND ai_usable = true
       AND public_url IS NOT NULL
     ORDER BY used_count ASC, last_used_at ASC NULLS FIRST
     LIMIT 1`,
    [userId]
  );

  if (fallback.length > 0) {
    await markUsed(sql, fallback[0].id);
    return fallback[0];
  }

  return null;
}

async function markUsed(
  sql: NeonQueryFunction<false, false>,
  mediaId: string
): Promise<void> {
  await query(
    sql,
    "UPDATE media_assets SET used_count = used_count + 1, last_used_at = NOW() WHERE id = $1",
    [mediaId]
  );
}
