import type { NeonQueryFunction } from "@neondatabase/serverless";
import { query, queryOne } from "./db";

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
 * Uses Supabase REST API to read, no SDK dependency needed.
 */
export async function syncTroupeImages(
  sql: NeonQueryFunction<false, false>,
  userId: string,
  troupeUrl: string,
  troupeKey: string,
): Promise<SyncResult> {
  // Fetch images with folder info from Troupe Supabase
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
  let synced = 0;
  let skipped = 0;

  for (const img of images) {
    if (!img.file_path) {
      skipped++;
      continue;
    }

    // Check if already synced
    const existing = await queryOne(
      sql,
      "SELECT id FROM media_assets WHERE troupe_image_id = $1",
      [img.id],
    );

    if (existing) {
      skipped++;
      continue;
    }

    // Build tags from folder name + photographer
    const tags: string[] = [];
    if (img.picks_folders?.name) tags.push(img.picks_folders.name);
    if (img.picks_folders?.photographer_name) {
      tags.push(img.picks_folders.photographer_name);
    }

    await query(
      sql,
      `INSERT INTO media_assets
        (user_id, storage_path, public_url, filename, tags, ai_usable, analyzed, source_system, troupe_image_id)
       VALUES ($1, $2, $3, $4, $5, true, false, 'troupe', $6)`,
      [
        userId,
        img.file_path,
        img.file_path,
        img.file_name,
        tags,
        img.id,
      ],
    );
    synced++;
  }

  return { synced, skipped, total: images.length };
}
