#!/bin/bash
# ============================================================
# CreatorOS: Supabase → Neon Data Migration Script
# ============================================================
#
# Prerequisites:
#   - psql installed
#   - Access to both Supabase and Neon databases
#   - Schema already created in Neon (run neon-schema.sql first)
#
# Usage:
#   ./scripts/migrate-data.sh
#
# ============================================================

set -euo pipefail

# Source (Supabase) - fill in your Supabase connection string
SUPABASE_DB="${SUPABASE_DB:-postgresql://postgres:YOUR_PASSWORD@db.utecdkwvjraucimdflnw.supabase.co:5432/postgres}"

# Target (Neon)
NEON_DB="${NEON_DB:-postgresql://neondb_owner:npg_zwXUkax95cmy@ep-icy-hat-age20swm-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require}"

DUMP_DIR="/tmp/creatoros-migration"
mkdir -p "$DUMP_DIR"

echo "=============================="
echo "CreatorOS Data Migration"
echo "=============================="
echo ""

# Tables to migrate (in dependency order)
TABLES=(
  "profiles"
  "user_roles"
  "brand_rules"
  "settings"
  "meta_connections"
  "instagram_tokens"
  "topics"
  "posts"
  "assets"
  "slide_assets"
  "content_snippets"
  "media_assets"
  "content_plan"
  "instagram_comments"
  "reply_queue"
  "comment_reply_queue"
  "blacklist_topics"
  "answered_by_ignore_accounts"
  "emoji_nogo_terms"
  "collaborators"
  "reply_training_data"
  "daily_account_stats"
  "video_projects"
  "video_segments"
  "video_renders"
  "chat_conversations"
  "chat_messages"
  "upload_sessions"
  "logs"
)

echo "Step 1: Exporting data from Supabase..."
echo ""

for TABLE in "${TABLES[@]}"; do
  echo "  Exporting: $TABLE"
  pg_dump --data-only --no-owner --no-privileges \
    --table="public.$TABLE" \
    "$SUPABASE_DB" > "$DUMP_DIR/$TABLE.sql" 2>/dev/null || echo "    WARNING: Could not export $TABLE"
done

echo ""
echo "Step 2: Converting user_id types (UUID → TEXT)..."
echo ""

# The user_id columns in Supabase reference auth.users UUIDs
# In Neon, user_id is TEXT (Stack Auth IDs)
# For now, we keep the UUIDs as-is - they'll be updated after user mapping

echo "  (Keeping UUID format - will be updated after Stack Auth user mapping)"

echo ""
echo "Step 3: Importing data to Neon..."
echo ""

for TABLE in "${TABLES[@]}"; do
  if [ -f "$DUMP_DIR/$TABLE.sql" ] && [ -s "$DUMP_DIR/$TABLE.sql" ]; then
    echo "  Importing: $TABLE"
    psql "$NEON_DB" < "$DUMP_DIR/$TABLE.sql" 2>/dev/null || echo "    WARNING: Error importing $TABLE"
  else
    echo "  Skipping: $TABLE (no data or export failed)"
  fi
done

echo ""
echo "Step 4: Updating storage URLs (Supabase → R2)..."
echo ""

R2_PUBLIC_URL="${R2_PUBLIC_URL:-https://pub-YOUR_HASH.r2.dev}"
SUPABASE_STORAGE_URL="https://utecdkwvjraucimdflnw.supabase.co/storage/v1/object/public"

# Update public_url in media_assets
psql "$NEON_DB" -c "
  UPDATE media_assets
  SET public_url = REPLACE(public_url, '$SUPABASE_STORAGE_URL/media-archive/', '$R2_PUBLIC_URL/media/')
  WHERE public_url LIKE '%$SUPABASE_STORAGE_URL%';
" 2>/dev/null || echo "  WARNING: Could not update media_assets URLs"

# Update public_url in assets
psql "$NEON_DB" -c "
  UPDATE assets
  SET public_url = REPLACE(public_url, '$SUPABASE_STORAGE_URL/post-assets/', '$R2_PUBLIC_URL/post-assets/')
  WHERE public_url LIKE '%$SUPABASE_STORAGE_URL%';
" 2>/dev/null || echo "  WARNING: Could not update assets URLs"

# Update video URLs
psql "$NEON_DB" -c "
  UPDATE video_projects
  SET source_video_url = REPLACE(source_video_url, '$SUPABASE_STORAGE_URL/video-assets/', '$R2_PUBLIC_URL/video-assets/')
  WHERE source_video_url LIKE '%$SUPABASE_STORAGE_URL%';
" 2>/dev/null || echo "  WARNING: Could not update video_projects URLs"

echo ""
echo "Step 5: Verification..."
echo ""

# Count rows in each table
for TABLE in "${TABLES[@]}"; do
  COUNT=$(psql "$NEON_DB" -t -c "SELECT COUNT(*) FROM public.$TABLE;" 2>/dev/null | tr -d ' ' || echo "0")
  echo "  $TABLE: $COUNT rows"
done

echo ""
echo "=============================="
echo "Migration complete!"
echo ""
echo "Next steps:"
echo "  1. Create Stack Auth users for each Supabase auth user"
echo "  2. Update user_id columns with new Stack Auth IDs"
echo "  3. Verify data integrity"
echo "  4. Deploy Cloudflare Worker"
echo "  5. Update frontend environment variables"
echo "=============================="
