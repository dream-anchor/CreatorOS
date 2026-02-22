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

interface TroupeVote {
  image_id: string;
  user_id: string;
  vote_status: "approved" | "unsure" | "rejected";
}

interface SyncResult {
  synced: number;
  skipped: number;
  removed: number;
  total: number;
  folders_found?: number;
}

/**
 * Compute the "Schnittmenge" (intersection): images where ALL voters voted 'approved'.
 * Returns a Set of image IDs that pass the filter.
 */
function computeSchnittmenge(votes: TroupeVote[]): Set<string> {
  // Find all distinct voters
  const allVoters = new Set(votes.map(v => v.user_id));
  if (allVoters.size === 0) return new Set();

  // Group votes by image_id
  const votesByImage = new Map<string, TroupeVote[]>();
  for (const v of votes) {
    const arr = votesByImage.get(v.image_id) || [];
    arr.push(v);
    votesByImage.set(v.image_id, arr);
  }

  // Image is in Schnittmenge when ALL voters have voted 'approved'
  const approved = new Set<string>();
  for (const [imageId, imgVotes] of votesByImage) {
    const allApproved = [...allVoters].every(voterId =>
      imgVotes.some(v => v.user_id === voterId && v.vote_status === "approved")
    );
    if (allApproved) approved.add(imageId);
  }

  return approved;
}

/**
 * Sync images from Troupe (paterbrown.com Picks) into CreatorOS media_assets.
 * Only syncs images that are in the Schnittmenge (all voters approved).
 * Removes previously synced images that are no longer approved.
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

  // 1. Fetch images + folders + votes in parallel
  const [imagesRes, foldersRes, votesRes] = await Promise.all([
    fetch(
      `${troupeUrl}/rest/v1/images?select=id,file_name,file_path,thumbnail_url,preview_url,title,folder_id,created_at&deleted_at=is.null&file_path=neq.null&order=created_at.desc&limit=500`,
      { headers },
    ),
    fetch(
      `${troupeUrl}/rest/v1/picks_folders?select=id,name,photographer_name`,
      { headers },
    ),
    fetch(
      `${troupeUrl}/rest/v1/image_votes?select=image_id,user_id,vote_status`,
      { headers },
    ),
  ]);

  if (!imagesRes.ok) {
    const errText = await imagesRes.text();
    throw new Error(`Troupe images API error ${imagesRes.status}: ${errText}`);
  }

  const images = (await imagesRes.json()) as TroupeImage[];
  if (images.length === 0) return { synced: 0, skipped: 0, removed: 0, total: 0 };

  // Parse folders
  let folderMap = new Map<string, TroupeFolder>();
  if (foldersRes.ok) {
    const folders = (await foldersRes.json()) as TroupeFolder[];
    folderMap = new Map(folders.map(f => [f.id, f]));
  }

  // Parse votes + compute Schnittmenge
  let approvedIds = new Set<string>();
  if (votesRes.ok) {
    const votes = (await votesRes.json()) as TroupeVote[];
    approvedIds = computeSchnittmenge(votes);
    console.log(`[troupe-sync] Schnittmenge: ${approvedIds.size} of ${images.length} images approved by all voters`);
  } else {
    console.warn(`[troupe-sync] image_votes fetch failed (${votesRes.status}) — syncing all images as fallback`);
    // Fallback: if votes table isn't accessible, sync all (graceful degradation)
    approvedIds = new Set(images.map(img => img.id));
  }

  // 2. Filter to approved images with file_path
  const approvedImages = images.filter((img) => img.file_path && approvedIds.has(img.id));
  const skipped = images.length - approvedImages.length;

  // 3. Remove previously synced images that are no longer in Schnittmenge
  const approvedTroupeIds = approvedImages.map(img => img.id);
  let removed = 0;

  if (approvedTroupeIds.length > 0) {
    // Delete troupe images NOT in the approved set
    const placeholders = approvedTroupeIds.map((_, i) => `$${i + 2}`).join(", ");
    const delResult = await query<{ c: string }>(
      sql,
      `WITH deleted AS (
        DELETE FROM media_assets
        WHERE source_system = 'troupe' AND user_id = $1
          AND troupe_image_id IS NOT NULL
          AND troupe_image_id NOT IN (${placeholders})
        RETURNING 1
      ) SELECT count(*) as c FROM deleted`,
      [userId, ...approvedTroupeIds],
    );
    removed = parseInt(delResult[0]?.c || "0", 10);
  } else {
    // No approved images → remove all troupe images
    const delResult = await query<{ c: string }>(
      sql,
      `WITH deleted AS (
        DELETE FROM media_assets
        WHERE source_system = 'troupe' AND user_id = $1 AND troupe_image_id IS NOT NULL
        RETURNING 1
      ) SELECT count(*) as c FROM deleted`,
      [userId],
    );
    removed = parseInt(delResult[0]?.c || "0", 10);
  }

  if (removed > 0) {
    console.log(`[troupe-sync] Removed ${removed} images no longer in Schnittmenge`);
  }

  if (approvedImages.length === 0) {
    return { synced: 0, skipped, removed, total: images.length, folders_found: folderMap.size };
  }

  // 4. Batch UPSERT approved images
  const valueClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const img of approvedImages) {
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

  return { synced: approvedImages.length, skipped, removed, total: images.length, folders_found: folderMap.size };
}
