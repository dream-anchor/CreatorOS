# CreatorOS - Kontext

## ⚠️ KRITISCH: Git Workflow
**USER ARBEITET LIVE IN PRODUCTION - JEDE Änderung sofort pushen!**
- User sieht nur GitHub, nicht lokale Files
- Lovable deployt Frontend automatisch bei Push (gpt-engineer-app[bot])
- Workflow: `git add . && git commit -m "msg" && git push`
- Bei mehreren Änderungen: EINEN commit, dann push

## Stack & Deployment
- **Frontend**: React + TS + Vite + Tailwind + shadcn/ui
- **Backend**: Cloudflare Workers + Hono
- **DB**: Neon Serverless PostgreSQL (`@neondatabase/serverless`)
- **Auth**: Neon Auth (JWT via `authMiddleware`)
- **Storage**: Cloudflare R2 (videos/audio/media)
- **AI**: OpenAI (GPT-4o, Whisper) via `lib/ai.ts`
- **Video**: Shotstack Render API
- **Deploy Frontend**: Lovable.dev (auto-deploy bei git push)
- **Deploy Worker**: `cd workers/api && npx wrangler deploy`
- **Cron**: Cloudflare Cron Triggers (konfiguriert in `wrangler.toml`)

## Worker (Cloudflare)
- Code: `workers/api/src/`
- Einstiegspunkt: `workers/api/src/index.ts`
- Config: `workers/api/wrangler.toml`
- Deploy: `cd workers/api && npx wrangler deploy`
- URL: `https://creatoros-api.antoine-dfc.workers.dev`

### Secrets (via `wrangler secret put`):
DATABASE_URL, OPENAI_API_KEY, SHOTSTACK_API_KEY, INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, NEON_AUTH_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL

### Cron Jobs
- `0 7 * * *` (09:00 CET) → `auto-generate-event-posts`
- Scheduled Handler in `index.ts` ruft intern `/api/cron/auto-generate-event-posts` auf

## DB (Neon PostgreSQL)
- Connection: Worker Env Var `DATABASE_URL`, nie im Frontend
- DB-Helpers: `lib/db.ts` → `getDb()`, `query()`, `queryOne()`
- Params: Positional `$1, $2, ...`
- Migrations: `node scripts/run-migration.mjs scripts/migrations/XXX.sql`
- Schema-Doku: `scripts/neon-schema.sql`

## Cloudflare R2
- Bucket: `creatoros-storage`, URL: `https://pub-4be7521d201444f49bdcdecc6fa137cf.r2.dev`
- Upload: Presigned URL via `get-presigned-url` → PUT zu R2
- Delete: `delete-from-r2` (AWS Sig V4)

## API-Routen
- Auth: `c.get("userId")` aus JWT
- Public Paths (kein Auth): `/api/cron/`, `/api/instagram/webhook`
- Pattern: `export { app as xxxRoutes }` → registriert in `index.ts`
- Routen: upload, posts, media, video, instagram, community, analytics, training, calendar, chat, settings, cron, events

## Video Pipeline
1. **Upload**: R2 via Presigned URL (max 2GB)
2. **Frames**: Client-side Canvas → batch `analyze-video-frames`
3. **Audio**: Client-side OfflineAudioContext → 16kHz mono WAV (~3-5MB) → R2 → `transcribe-video` (Whisper 25MB-Limit)
4. **Segmente**: `select-reel-segments` via AI
5. **Render**: `render-reel` → Shotstack → `render-reel-callback` Webhook

## Events Auto-Posting
- Events CRUD: `/api/events`
- Templates: announcement (14d), countdown (7d), reminder (1d), thankyou (+1d)
- Settings: `auto_post_mode` = off | draft | review | auto
- Max 1 Post/User/Cron-Run
- AI: `callOpenAI()` + `extractToolArgs()` mit Template-Prompts

## Sprache
- UI: Deutsch
- Code/Logs: Englisch Präfix + Deutsch (z.B. `"Projekt nicht gefunden"`)
- Errors: Deutsch

# currentDate
Today's date is 2026-02-20.

      IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
