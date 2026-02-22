import type { NeonQueryFunction } from "@neondatabase/serverless";
import { query } from "./db";

interface TroupeImage {
  id: string;
  file_name: string;
  file_path: string;
  thumbnail_url: string | null;
  preview_url: string | null;
  title: string | null;
  folder_id: string | null;
  created_at: string;
  picks_folders: {
    name: string;
    photographer_name: string | null;
  } | null;
}

interface SyncResult {
  synced: number;
  skipped: number;
  total: number;
}

/**
 * Sync images from Troupe (paterbrown.com Picks) into CreatorOS media_assets.
 * Optimized: 1 fetch + 1 dedup query + 1 batch INSERT (max 3 subrequests).
 */
export async function syncTroupeImages(
  sql: NeonQueryFunction<false, false>,
  userId: string,
  troupeUrl: string,
  troupeKey: string,
): Promise<SyncResult> {
  // 1. Fetch images with folder info from Troupe Supabase (1 subrequest)
  const url = `${troupeUrl}/rest/v1/images?select=id,file_name,file_path,thumbnail_url,preview_url,title,folder_id,created_at,picks_folders(name,photographer_name)&deleted_at=is.null&file_path=neq.null&order=created_at.desc&limit=500`;

  const res = await fetch(url, {
    headers: {
      apikey: troupeKey,
      Authorization: `Bearer ${troupeKey}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Troupe API error ${res.status}: ${errText}`);
  }

  const images = (await res.json()) as TroupeImage[];
  if (images.length === 0) return { synced: 0, skipped: 0, total: 0 };

  // 2. Load all existing troupe_image_ids in one query (1 subrequest)
  const existingRows = await query<{ troupe_image_id: string }>(
    sql,
    "SELECT troupe_image_id FROM media_assets WHERE troupe_image_id IS NOT NULL AND user_id = $1",
    [userId],
  );
  const existingIds = new Set(existingRows.map((r) => r.troupe_image_id));

  // 3. Filter to new images only
  const newImages = images.filter(
    (img) => img.file_path && !existingIds.has(img.id),
  );

  if (newImages.length === 0) {
    return { synced: 0, skipped: images.length, total: images.length };
  }

  // 4. Batch INSERT all new images in one query (1 subrequest)
  const valueClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const img of newImages) {
    const tags: string[] = [];
    if (img.picks_folders?.name) tags.push(img.picks_folders.name);
    if (img.picks_folders?.photographer_name) {
      tags.push(img.picks_folders.photographer_name);
    }

    const folderName = img.picks_folders?.name ?? null;
    valueClauses.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, true, false, 'troupe', $${idx + 5}, $${idx + 6})`,
    );
    params.push(userId, img.file_path, img.file_path, img.file_name, tags, img.id, folderName);
    idx += 7;
  }

  await query(
    sql,
    `INSERT INTO media_assets
      (user_id, storage_path, public_url, filename, tags, ai_usable, analyzed, source_system, troupe_image_id, troupe_folder_name)
     VALUES ${valueClauses.join(", ")}
     ON CONFLICT (troupe_image_id) WHERE troupe_image_id IS NOT NULL DO NOTHING`,
    params,
  );

  const skipped = images.length - newImages.length;
  return { synced: newImages.length, skipped, total: images.length };
}
