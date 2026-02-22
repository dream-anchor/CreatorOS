-- 004b_backfill_troupe_folder.sql
-- Backfill troupe_folder_name from tags[1] for existing Troupe rows

UPDATE media_assets
SET troupe_folder_name = tags[1]
WHERE source_system = 'troupe'
  AND troupe_folder_name IS NULL
  AND array_length(tags, 1) > 0;
