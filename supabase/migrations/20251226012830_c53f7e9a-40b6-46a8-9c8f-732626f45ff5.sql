-- Drop the partial index that was just created
DROP INDEX IF EXISTS posts_ig_media_id_key;

-- Create a proper NON-PARTIAL unique index that can be used as a constraint
-- This works with upsert because it's a full unique constraint
ALTER TABLE posts ADD CONSTRAINT posts_ig_media_id_constraint UNIQUE (ig_media_id);