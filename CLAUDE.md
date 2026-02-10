# CreatorOS - Projekt-Kontext

## Stack
- **Frontend**: React + TypeScript + Vite + Tailwind + shadcn/ui
- **Backend**: Supabase (Auth, DB, Edge Functions, Storage)
- **Storage**: Cloudflare R2 (videos, audio) + Supabase Storage (legacy)
- **AI**: Claude Vision via Lovable Gateway (`openai/gpt-5`), OpenAI Whisper, Shotstack Render API
- **Deployment**: Lovable.dev (Frontend + Supabase Edge Functions)

## Lovable/Supabase Deployment-Workflow

### WICHTIG: Edge Functions deployen
Edge Functions werden NICHT via CLI (`supabase functions deploy`) deployt, sondern ausschließlich via **Lovable-Prompt**. Der User hat keinen direkten CLI-Zugang zu Supabase.

**Prompt-Template zum Deployen:**
```
Deploye die folgenden Supabase Edge Functions:
- [function-name-1]
- [function-name-2]

Hier ist der aktuelle Code:

### [function-name-1] (`supabase/functions/[function-name-1]/index.ts`):
[Code hier einfügen]
```

### WICHTIG: Supabase Secrets setzen
Secrets (API-Keys, Umgebungsvariablen) werden ebenfalls via **Lovable-Prompt** gesetzt, nicht über das Supabase Dashboard direkt.

**Prompt-Template für Secrets:**
```
Setze folgende Supabase Edge Function Secrets:
- SECRET_NAME=secret_value
- SECRET_NAME_2=secret_value_2
```

### WICHTIG: SQL-Migrationen
Datenbank-Migrationen werden via **Lovable-Prompt** angewendet:

**Prompt-Template:**
```
Führe folgende SQL-Migration in der Supabase-Datenbank aus:

[SQL hier einfügen]
```

### Genereller Workflow
1. Code lokal in Claude Code schreiben/ändern
2. Commit + Push zu GitHub
3. **Lovable-Prompt** an den User geben mit dem Code/SQL/Secrets
4. User führt den Prompt in Lovable aus
5. Lovable deployt automatisch zu Supabase

## Cloudflare R2 Storage

- **Bucket**: `creatoros-storage`
- **Public URL**: `https://pub-4be7521d201444f49bdcdecc6fa137cf.r2.dev`
- **Secrets** (in Supabase gesetzt): `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- **Upload-Flow**: Frontend holt Presigned URL via `get-presigned-url` Edge Function, dann PUT direkt zu R2
- **Löschen**: Via `delete-from-r2` Edge Function (AWS Signature V4)

## Supabase Edge Functions (config.toml)

Alle Functions haben `verify_jwt = false` (Auth wird manuell im Code geprüft).
Bei neuen Functions: Eintrag in `supabase/config.toml` hinzufügen.

## Video/Reel Pipeline

### Flow
1. Upload: Video direkt zu R2 via Presigned URL (max 2GB)
2. Frame-Analyse: Client-seitig Frames extrahieren (Canvas API), dann batched an `analyze-video-frames`
3. Transkription: Client-seitig Audio extrahieren (OfflineAudioContext, 16kHz mono WAV ~3-5MB), zu R2 hochladen, dann `transcribe-video` mit `audio_url` Parameter
4. Segment-Auswahl: `select-reel-segments` via AI
5. Rendering: `render-reel` → Shotstack API → `render-reel-callback` Webhook

### Whisper Workaround
Whisper hat ein 25MB-Limit. Lösung: Client-seitig Audio als 16kHz mono WAV extrahieren (~3-5MB statt 66MB+ Video), zu R2 hochladen, und `audio_url` an `transcribe-video` übergeben.

## Sprache
- UI-Texte: Deutsch
- Code-Kommentare & Logs: Englisch Präfix + Deutsch Inhalt (z.B. `"Projekt nicht gefunden"`)
- Error Messages an User: Deutsch
