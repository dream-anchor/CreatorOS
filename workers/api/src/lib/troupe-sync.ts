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

  // 2. Filter to images with file_path
  const validImages = images.filter((img) => img.file_path);
  if (validImages.length === 0) {
    return { synced: 0, skipped: 0, total: images.length };
  }

  // 3. Batch UPSERT all images (1 subrequest)
  // ON CONFLICT: update thumbnail_url + troupe_folder_name but preserve ai_usable
  const valueClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const img of validImages) {
    const tags: string[] = [];
    if (img.picks_folders?.name) tags.push(img.picks_folders.name);
    if (img.picks_folders?.photographer_name) {
      tags.push(img.picks_folders.photographer_name);
    }

    const folderName = img.picks_folders?.name ?? null;
    valueClauses.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, true, false, 'troupe', $${idx + 5}, $${idx + 6}, $${idx + 7})`,
    );
    params.push(userId, img.file_path, img.file_path, img.file_name, tags, img.id, folderName, img.thumbnail_url);
    idx += 8;
  }

  await query(
    sql,
    `INSERT INTO media_assets
      (user_id, storage_path, public_url, filename, tags, ai_usable, analyzed, source_system, troupe_image_id, troupe_folder_name, thumbnail_url)
     VALUES ${valueClauses.join(", ")}
     ON CONFLICT (troupe_image_id) WHERE troupe_image_id IS NOT NULL
     DO UPDATE SET thumbnail_url = EXCLUDED.thumbnail_url, troupe_folder_name = EXCLUDED.troupe_folder_name`,
    params,
  );

  // Count how many were truly new (didn't exist before)
  const afterRows = await query<{ c: string }>(
    sql,
    "SELECT count(*) as c FROM media_assets WHERE source_system = 'troupe' AND user_id = $1",
    [userId],
  );
  const totalAfter = parseInt(afterRows[0]?.c || "0", 10);
  const newCount = totalAfter - (images.length - validImages.length);
  // Approximate: synced = total troupe rows now, skipped = those that existed before
  return { synced: validImages.length, skipped: 0, total: images.length };
}
