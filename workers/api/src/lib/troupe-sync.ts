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
}

interface TroupeFolder {
  id: string;
  name: string;
  photographer_name: string | null;
}

interface SyncResult {
  synced: number;
  skipped: number;
  total: number;
  folders_found?: number;
}

/**
 * Sync images from Troupe (paterbrown.com Picks) into CreatorOS media_assets.
 * Fetches images + folders separately, joins client-side.
 */
export async function syncTroupeImages(
  sql: NeonQueryFunction<false, false>,
  userId: string,
  troupeUrl: string,
  troupeKey: string,
): Promise<SyncResult> {
  const headers = {
    apikey: troupeKey,
    Authorization: `Bearer ${troupeKey}`,
  };

  // 1. Fetch images + folders in parallel (2 subrequests)
  const [imagesRes, foldersRes] = await Promise.all([
    fetch(
      `${troupeUrl}/rest/v1/images?select=id,file_name,file_path,thumbnail_url,preview_url,title,folder_id,created_at&deleted_at=is.null&file_path=neq.null&order=created_at.desc&limit=500`,
      { headers },
    ),
    fetch(
      `${troupeUrl}/rest/v1/picks_folders?select=id,name,photographer_name`,
      { headers },
    ),
  ]);

  if (!imagesRes.ok) {
    const errText = await imagesRes.text();
    throw new Error(`Troupe images API error ${imagesRes.status}: ${errText}`);
  }

  const images = (await imagesRes.json()) as TroupeImage[];
  if (images.length === 0) return { synced: 0, skipped: 0, total: 0 };

  // Parse folders (may fail if table doesn't exist — graceful fallback)
  let folderMap = new Map<string, TroupeFolder>();
  if (foldersRes.ok) {
    const folders = (await foldersRes.json()) as TroupeFolder[];
    folderMap = new Map(folders.map(f => [f.id, f]));
  }

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
    const folder = img.folder_id ? folderMap.get(img.folder_id) : undefined;
    const tags: string[] = [];
    if (folder?.name) tags.push(folder.name);
    if (folder?.photographer_name) tags.push(folder.photographer_name);

    const folderName = folder?.name ?? null;
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
  return { synced: validImages.length, skipped: 0, total: images.length, folders_found: folderMap.size };
}
