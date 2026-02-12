# CreatorOS - Kontext

## ⚠️ KRITISCH: Git Workflow
**USER ARBEITET LIVE IN PRODUCTION - JEDE Änderung sofort pushen!**
- User sieht nur GitHub, nicht lokale Files
- Lovable deployt automatisch bei Push
- Workflow: `git add . && git commit -m "msg" && git push`
- Bei mehreren Änderungen: EINEN commit, dann push

## Stack & Deployment
- **Frontend**: React + TS + Vite + Tailwind + shadcn/ui
- **Backend**: Supabase (Auth, DB, Edge Functions, Storage)
- **Storage**: Cloudflare R2 (videos/audio) + Supabase Storage (legacy)
- **AI**: Claude Vision (Lovable Gateway `openai/gpt-5`), Whisper, Shotstack
- **Deploy**: Lovable.dev (kein CLI-Zugang zu Supabase)

## Lovable Deployment (via Prompt, NICHT CLI)

**Edge Functions deployen:**
```
Deploye Supabase Edge Function [name]:
[Code aus supabase/functions/[name]/index.ts]
```

**Secrets setzen:**
```
Setze Supabase Secrets:
- KEY=value
```

**SQL Migration:**
```
Führe SQL-Migration aus:
[SQL]
```

**Workflow**: Code lokal → commit + push → Lovable-Prompt an User → User führt in Lovable aus

## Cloudflare R2
- Bucket: `creatoros-storage`, URL: `https://pub-4be7521d201444f49bdcdecc6fa137cf.r2.dev`
- Secrets: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- Upload: Presigned URL via `get-presigned-url` → PUT zu R2
- Delete: `delete-from-r2` (AWS Sig V4)

## Supabase Edge Functions
- Alle: `verify_jwt = false` (manuelle Auth im Code)
- Neue Functions → Eintrag in `supabase/config.toml`

## Video Pipeline
1. **Upload**: R2 via Presigned URL (max 2GB)
2. **Frames**: Client-side Canvas → batch `analyze-video-frames`
3. **Audio**: Client-side OfflineAudioContext → 16kHz mono WAV (~3-5MB) → R2 → `transcribe-video` mit `audio_url` (Whisper 25MB-Limit)
4. **Segmente**: `select-reel-segments` via AI
5. **Render**: `render-reel` → Shotstack → `render-reel-callback` Webhook

## Sprache
- UI: Deutsch
- Code/Logs: Englisch Präfix + Deutsch (z.B. `"Projekt nicht gefunden"`)
- Errors: Deutsch
