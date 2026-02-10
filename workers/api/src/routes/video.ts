import { Hono } from "hono";
import type { Env } from "../index";
import { getDb, query, queryOne } from "../lib/db";
import { callOpenAI, extractToolArgs, transcribeAudio } from "../lib/ai";
import { authMiddleware } from "../middleware/auth";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** Validate a URL is safe to fetch (HTTPS only, no internal IPs) */
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const hostname = parsed.hostname.toLowerCase();
    // Block internal/private IPs and hostnames
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") return false;
    if (hostname.startsWith("10.") || hostname.startsWith("192.168.") || hostname.startsWith("172.")) return false;
    if (hostname === "169.254.169.254") return false; // AWS metadata
    if (hostname.endsWith(".internal") || hostname.endsWith(".local")) return false;
    return true;
  } catch {
    return false;
  }
}

/** HTML-escape a string to prevent XSS in Shotstack HTML renders */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Auth middleware for all routes except render-callback
app.use("/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.endsWith("/render-callback")) return next();
  // Auth is handled by the global middleware for /api/* routes
  return next();
});

// ============================================================
// GET /api/video/projects - List all video projects for user
// ============================================================
app.get("/projects", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);

  const projects = await query(sql,
    `SELECT id, post_id, source_video_path, source_video_url, source_duration_ms, source_width, source_height,
            status, error_message, target_duration_sec, subtitle_style, transition_style,
            rendered_video_url, rendered_video_path, created_at, updated_at
     FROM video_projects
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );

  return c.json(projects);
});

// ============================================================
// GET /api/video/projects/:id - Get single project with segments
// ============================================================
app.get("/projects/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const projectId = c.req.param("id");

  const fields = c.req.query("fields");

  let project;
  if (fields) {
    // Whitelist allowed fields to prevent SQL injection
    const allowed = new Set([
      "id", "user_id", "post_id", "source_video_path", "source_video_url",
      "source_duration_ms", "source_width", "source_height", "source_file_size",
      "status", "error_message", "frame_analysis", "transcript",
      "target_duration_sec", "subtitle_style", "transition_style",
      "background_music_url", "shotstack_render_id",
      "rendered_video_path", "rendered_video_url", "created_at", "updated_at"
    ]);
    const requestedFields = fields.split(",").filter(f => allowed.has(f.trim()));
    if (requestedFields.length === 0) {
      return c.json({ error: "Keine gültigen Felder angegeben" }, 400);
    }
    project = await queryOne(sql,
      `SELECT ${requestedFields.join(", ")} FROM video_projects WHERE id = $1 AND user_id = $2`,
      [projectId, userId]
    );
  } else {
    project = await queryOne(sql,
      "SELECT * FROM video_projects WHERE id = $1 AND user_id = $2",
      [projectId, userId]
    );
  }

  if (!project) return c.json({ error: "Projekt nicht gefunden" }, 404);

  // Include segments if full query
  if (!fields) {
    const segments = await query(sql,
      "SELECT * FROM video_segments WHERE project_id = $1 ORDER BY segment_index",
      [projectId]
    );
    (project as Record<string, unknown>).segments = segments;
  }

  return c.json(project);
});

// ============================================================
// POST /api/video/projects - Create a new video project
// ============================================================
app.post("/projects", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<Record<string, unknown>>();

  const result = await queryOne(sql,
    `INSERT INTO video_projects (user_id, source_video_path, source_video_url, source_duration_ms,
      source_width, source_height, source_file_size, status, target_duration_sec)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [userId, body.source_video_path, body.source_video_url, body.source_duration_ms,
     body.source_width, body.source_height, body.source_file_size,
     body.status || "uploaded", body.target_duration_sec || 30]
  );

  return c.json(result, 201);
});

// ============================================================
// PATCH /api/video/projects/:id - Update a video project
// ============================================================
app.patch("/projects/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const projectId = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>();

  // Build dynamic SET clause from allowed fields
  const allowed = new Set([
    "status", "error_message", "post_id", "target_duration_sec",
    "subtitle_style", "transition_style", "background_music_url"
  ]);
  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  for (const [key, val] of Object.entries(body)) {
    if (allowed.has(key)) {
      sets.push(`${key} = $${paramIdx++}`);
      values.push(val);
    }
  }

  if (sets.length === 0) return c.json({ error: "Keine gültigen Felder" }, 400);

  sets.push(`updated_at = NOW()`);
  values.push(projectId, userId);

  const result = await queryOne(sql,
    `UPDATE video_projects SET ${sets.join(", ")} WHERE id = $${paramIdx++} AND user_id = $${paramIdx} RETURNING *`,
    values
  );

  if (!result) return c.json({ error: "Projekt nicht gefunden" }, 404);
  return c.json(result);
});

// ============================================================
// PATCH /api/video/segments/:id - Update a segment
// ============================================================
app.patch("/segments/:id", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const segmentId = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>();

  const allowed = new Set([
    "is_included", "subtitle_text", "segment_index", "start_ms", "end_ms", "is_user_modified"
  ]);
  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  for (const [key, val] of Object.entries(body)) {
    if (allowed.has(key)) {
      sets.push(`${key} = $${paramIdx++}`);
      values.push(val);
    }
  }

  if (sets.length === 0) return c.json({ error: "Keine gültigen Felder" }, 400);

  values.push(segmentId, userId);

  const result = await queryOne(sql,
    `UPDATE video_segments SET ${sets.join(", ")} WHERE id = $${paramIdx++} AND user_id = $${paramIdx} RETURNING *`,
    values
  );

  if (!result) return c.json({ error: "Segment nicht gefunden" }, 404);
  return c.json(result);
});

// ============================================================
// POST /api/video/analyze-frames
// ============================================================
app.post("/analyze-frames", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { project_id, frames } = await c.req.json<{
    project_id: string;
    frames: Array<{ index: number; timestamp_ms: number; base64: string }>;
  }>();

  if (!project_id || !frames || frames.length === 0) {
    return c.json({ error: "project_id und frames sind erforderlich", success: false }, 400);
  }

  // Verify project belongs to user
  const project = await queryOne(sql,
    "SELECT id, frame_analysis FROM video_projects WHERE id = $1 AND user_id = $2",
    [project_id, userId]
  );
  if (!project) return c.json({ error: "Projekt nicht gefunden", success: false }, 404);

  await query(sql, "UPDATE video_projects SET status = 'analyzing_frames' WHERE id = $1", [project_id]);

  const results: Array<Record<string, unknown>> = [];
  const existingAnalysis = (project as Record<string, unknown>).frame_analysis as unknown[] || [];

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    try {
      const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Du bist ein Video-Analyse-Experte für Social Media Reels. Bewerte dieses Video-Frame nach seiner Eignung als Reel-Highlight. Nutze das Tool um die Ergebnisse zurückzugeben.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analysiere dieses Video-Frame (Timestamp: ${(frame.timestamp_ms / 1000).toFixed(1)}s):\n\n1. SCORE (0-10): Wie visuell interessant und reel-tauglich ist dieses Frame?\n2. BESCHREIBUNG: Was passiert in diesem Frame? (1 Satz)\n3. TAGS: 3-5 beschreibende Tags\n4. GESICHT: Ist ein Gesicht klar erkennbar?\n5. TEXT: Ist Text/Schrift im Bild sichtbar?\n6. ENERGIE: Wie dynamisch ist das Frame? (low/medium/high)`,
              },
              { type: "image_url", image_url: { url: frame.base64 } },
            ],
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analyze_video_frame",
            description: "Speichert die Frame-Analyse-Ergebnisse",
            parameters: {
              type: "object",
              properties: {
                score: { type: "number" },
                description: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                has_face: { type: "boolean" },
                has_text: { type: "boolean" },
                energy_level: { type: "string", enum: ["low", "medium", "high"] },
              },
              required: ["score", "description", "tags", "has_face", "has_text", "energy_level"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analyze_video_frame" } },
        max_completion_tokens: 500,
      });

      const args = extractToolArgs<Record<string, unknown>>(aiResponse, "analyze_video_frame");
      results.push({
        frame_index: frame.index,
        timestamp_ms: frame.timestamp_ms,
        score: args?.score ?? 5,
        description: args?.description || "Analysiert",
        tags: args?.tags || [],
        has_face: args?.has_face ?? false,
        has_text: args?.has_text ?? false,
        energy_level: args?.energy_level || "medium",
      });
    } catch (err) {
      console.error(`[analyze-frames] Error on frame ${frame.index}:`, err);
      results.push({
        frame_index: frame.index,
        timestamp_ms: frame.timestamp_ms,
        score: 0,
        description: "Analyse fehlgeschlagen",
        tags: [],
        has_face: false,
        has_text: false,
        energy_level: "low",
      });
    }

    // Rate limiting
    if (i < frames.length - 1) {
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  const merged = [...existingAnalysis, ...results];
  await query(sql, "UPDATE video_projects SET frame_analysis = $1 WHERE id = $2",
    [JSON.stringify(merged), project_id]);

  return c.json({ success: true, analyzed: results.length, total_frames: merged.length, results });
});

// ============================================================
// POST /api/video/transcribe
// ============================================================
app.post("/transcribe", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { project_id, audio_url } = await c.req.json<{
    project_id: string;
    audio_url?: string;
  }>();

  if (!project_id) return c.json({ error: "project_id ist erforderlich", success: false }, 400);

  const project = await queryOne<Record<string, unknown>>(sql,
    "SELECT id, source_video_path, source_video_url FROM video_projects WHERE id = $1 AND user_id = $2",
    [project_id, userId]
  );
  if (!project) return c.json({ error: "Projekt nicht gefunden", success: false }, 404);

  await query(sql, "UPDATE video_projects SET status = 'transcribing' WHERE id = $1", [project_id]);

  let fileData: Blob;
  let fileName = "audio.wav";
  let fileType = "audio/wav";

  if (audio_url) {
    if (!isSafeUrl(audio_url as string)) {
      return c.json({ error: "Ungültige Audio-URL", success: false }, 400);
    }
    const audioRes = await fetch(audio_url as string);
    if (!audioRes.ok) {
      await query(sql, "UPDATE video_projects SET status = 'failed', error_message = 'Audio-Download fehlgeschlagen' WHERE id = $1", [project_id]);
      return c.json({ error: "Audio konnte nicht heruntergeladen werden", success: false }, 500);
    }
    fileData = await audioRes.blob();
  } else {
    const videoUrl = project.source_video_url as string;
    if (!videoUrl) {
      return c.json({ error: "Keine Video-URL vorhanden", success: false }, 400);
    }
    if (!isSafeUrl(videoUrl)) {
      return c.json({ error: "Ungültige Video-URL", success: false }, 400);
    }
    fileName = "video.mp4";
    fileType = "video/mp4";
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      await query(sql, "UPDATE video_projects SET status = 'failed', error_message = 'Video-Download fehlgeschlagen' WHERE id = $1", [project_id]);
      return c.json({ error: "Video konnte nicht heruntergeladen werden", success: false }, 500);
    }
    fileData = await videoRes.blob();
  }

  try {
    const transcript = await transcribeAudio(c.env.OPENAI_API_KEY, fileData, fileName, fileType);

    await query(sql, "UPDATE video_projects SET transcript = $1 WHERE id = $2",
      [JSON.stringify(transcript), project_id]);

    await query(sql,
      "INSERT INTO logs (user_id, level, event_type, details) VALUES ($1, 'info', 'video_transcribed', $2)",
      [userId, JSON.stringify({ project_id, word_count: transcript.words.length })]
    );

    return c.json({ success: true, transcript, word_count: transcript.words.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await query(sql, "UPDATE video_projects SET status = 'failed', error_message = $1 WHERE id = $2", [msg, project_id]);
    return c.json({ error: msg, success: false }, 500);
  }
});

// ============================================================
// POST /api/video/select-segments
// ============================================================
app.post("/select-segments", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { project_id, target_duration_sec = 30 } = await c.req.json<{
    project_id: string;
    target_duration_sec?: number;
  }>();

  if (!project_id) return c.json({ error: "project_id ist erforderlich", success: false }, 400);

  const project = await queryOne<Record<string, unknown>>(sql,
    "SELECT id, frame_analysis, transcript, source_duration_ms FROM video_projects WHERE id = $1 AND user_id = $2",
    [project_id, userId]
  );
  if (!project) return c.json({ error: "Projekt nicht gefunden", success: false }, 404);

  const frameAnalysis = project.frame_analysis as Array<Record<string, unknown>>;
  if (!frameAnalysis || frameAnalysis.length === 0) {
    return c.json({ error: "Keine Frame-Analyse vorhanden", success: false }, 400);
  }

  await query(sql, "UPDATE video_projects SET status = 'selecting_segments' WHERE id = $1", [project_id]);

  const framesSummary = frameAnalysis.map((f) =>
    `[${((f.timestamp_ms as number) / 1000).toFixed(1)}s] Score: ${f.score}/10 | ${f.description} | Tags: ${(f.tags as string[]).join(", ")} | Energie: ${f.energy_level} | Gesicht: ${f.has_face ? "ja" : "nein"}`
  ).join("\n");

  let transcriptSummary = "Kein Transkript verfügbar.";
  const transcript = project.transcript as Record<string, unknown> | null;
  if (transcript?.text) {
    transcriptSummary = `Volltext: "${transcript.text}"\n\nWörter mit Timestamps:\n`;
    const words = (transcript.words as Array<{ word: string; start: number; end: number }>) || [];
    let chunk = "";
    let chunkStart = 0;
    for (const w of words) {
      if (chunk === "") chunkStart = w.start;
      chunk += w.word + " ";
      if (w.end - chunkStart >= 5 || w === words[words.length - 1]) {
        transcriptSummary += `[${chunkStart.toFixed(1)}s - ${w.end.toFixed(1)}s]: ${chunk.trim()}\n`;
        chunk = "";
      }
    }
  }

  const videoDuration = project.source_duration_ms
    ? ((project.source_duration_ms as number) / 1000).toFixed(1)
    : "unbekannt";

  try {
    const aiResponse = await callOpenAI(c.env.OPENAI_API_KEY, {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Du bist ein professioneller Reel-Editor und Storyteller. Deine Aufgabe ist es, aus einem längeren Video ein ${target_duration_sec}-Sekunden Instagram Reel zu schneiden, das eine ZUSAMMENHÄNGENDE GESCHICHTE erzählt.

## WICHTIGSTE REGEL: NARRATIVE KOHÄRENZ
Das Reel muss eine logische, verständliche Geschichte erzählen. Die Segmente müssen inhaltlich zusammenpassen und in der richtigen Reihenfolge stehen. Du schneidest NICHT einfach die "besten Momente" zusammen – du erzählst die Geschichte des Videos komprimiert nach.

## Story-Struktur (MUSS eingehalten werden):
1. **HOOK (0-3s)**: Der packendste Moment oder eine spannende Frage/Aussage, die Neugier weckt
2. **KONTEXT (3-8s)**: Worum geht es? Setze die Szene / erkläre den Hintergrund
3. **AUFBAU (8-20s)**: Der Hauptinhalt – Entwicklung, Argumentation, Demonstration
4. **HÖHEPUNKT (20-25s)**: Die wichtigste Erkenntnis, das Ergebnis, der Wow-Moment
5. **CTA/ABSCHLUSS (letzte 3-5s)**: Zusammenfassung oder Call-to-Action

## Regeln:
- Segmente müssen eine LOGISCHE REIHENFOLGE haben (chronologisch oder thematisch)
- Nutze das TRANSKRIPT als primäre Grundlage für die Story-Auswahl
- Schneide NICHT mitten in einem Satz – jedes Segment muss bei einer natürlichen Sprechpause beginnen und enden
- Jedes Segment 3-8 Sekunden lang
- Gesamtdauer ca. ${target_duration_sec}s (±3s erlaubt)
- Untertitel: Fasse den KERN des gesprochenen Inhalts in max. 10 Wörtern zusammen
- Keine Überlappungen
- Begründe bei jedem Segment seine Rolle in der Story (Hook/Kontext/Aufbau/Höhepunkt/CTA)

## Segment-Auswahl Priorität:
1. Inhaltliche Relevanz für die Geschichte (WICHTIGSTES Kriterium)
2. Natürliche Satzgrenzen als Start/Ende
3. Visueller Score als Tiebreaker bei gleichwertigen Optionen

Nutze das Tool.`,
        },
        {
          role: "user",
          content: `Video-Dauer: ${videoDuration}s\nZiel-Reel-Dauer: ${target_duration_sec}s\n\n=== TRANSKRIPT (PRIMÄRE QUELLE für Story-Auswahl) ===\n${transcriptSummary}\n\n=== FRAME-ANALYSE (SEKUNDÄR für visuelle Qualität) ===\n${framesSummary}\n\nBitte wähle Segmente, die zusammen eine kohärente Geschichte erzählen. Die Reihenfolge der Segmente im Reel darf von der Originalreihenfolge abweichen, wenn es der Story dient (z.B. Hook = spannendster Moment vorgezogen).`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "select_reel_segments",
          description: "Gibt die ausgewählten Reel-Segmente zurück, geordnet nach ihrer Position im fertigen Reel",
          parameters: {
            type: "object",
            properties: {
              story_summary: {
                type: "string",
                description: "Kurze Beschreibung der erzählten Geschichte in 1-2 Sätzen",
              },
              segments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    segment_index: { type: "integer", description: "Position im fertigen Reel (0 = erster Clip)" },
                    start_ms: { type: "integer", description: "Startzeit im Originalvideo in Millisekunden" },
                    end_ms: { type: "integer", description: "Endzeit im Originalvideo in Millisekunden" },
                    score: { type: "number", description: "Visueller Qualitätsscore 0-10" },
                    narrative_role: { type: "string", enum: ["hook", "context", "buildup", "climax", "cta"], description: "Rolle dieses Segments in der Story-Struktur" },
                    reason: { type: "string", description: "Warum dieses Segment gewählt wurde und welche Rolle es in der Geschichte spielt" },
                    transcript_text: { type: "string", description: "Was in diesem Segment gesprochen wird" },
                    subtitle_text: { type: "string", description: "Komprimierter Untertitel (max. 10 Wörter)" },
                  },
                  required: ["segment_index", "start_ms", "end_ms", "score", "narrative_role", "reason", "subtitle_text"],
                },
              },
            },
            required: ["story_summary", "segments"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "select_reel_segments" } },
      max_completion_tokens: 4000,
    });

    const result = extractToolArgs<{ segments: Array<Record<string, unknown>> }>(aiResponse, "select_reel_segments");
    let segments = result?.segments;

    // Fallback: try from array directly
    if (!segments && Array.isArray(result)) {
      segments = result as Array<Record<string, unknown>>;
    }

    if (!segments || segments.length === 0) {
      await query(sql, "UPDATE video_projects SET status = 'failed', error_message = 'KI hat keine Segmente zurückgegeben' WHERE id = $1", [project_id]);
      return c.json({ error: "KI hat keine Segmente ausgewählt", success: false }, 500);
    }

    // Delete existing segments
    await query(sql, "DELETE FROM video_segments WHERE project_id = $1", [project_id]);

    // Insert new segments
    for (const seg of segments) {
      await query(sql,
        `INSERT INTO video_segments (project_id, user_id, segment_index, start_ms, end_ms, score, reason, transcript_text, subtitle_text, is_included, is_user_modified)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, false)`,
        [project_id, userId, seg.segment_index, seg.start_ms, seg.end_ms, seg.score, seg.reason || null, seg.transcript_text || null, seg.subtitle_text || null]
      );
    }

    await query(sql, "UPDATE video_projects SET status = 'segments_ready' WHERE id = $1", [project_id]);

    const insertedSegments = await query(sql,
      "SELECT * FROM video_segments WHERE project_id = $1 ORDER BY segment_index", [project_id]);

    return c.json({ success: true, segments: insertedSegments, segment_count: segments.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await query(sql, "UPDATE video_projects SET status = 'failed', error_message = $1 WHERE id = $2", [msg, project_id]);
    return c.json({ error: msg, success: false }, 500);
  }
});

// ============================================================
// POST /api/video/render
// ============================================================
app.post("/render", async (c) => {
  const userId = c.get("userId");
  const sql = getDb(c.env.DATABASE_URL);
  const { project_id, subtitle_style = "bold_center", transition_style = "smooth" } = await c.req.json<{
    project_id: string;
    subtitle_style?: string;
    transition_style?: string;
  }>();

  if (!project_id) return c.json({ error: "project_id ist erforderlich", success: false }, 400);

  const project = await queryOne<Record<string, unknown>>(sql,
    "SELECT id, source_video_url FROM video_projects WHERE id = $1 AND user_id = $2",
    [project_id, userId]
  );
  if (!project) return c.json({ error: "Projekt nicht gefunden", success: false }, 404);
  if (!project.source_video_url) return c.json({ error: "Keine Quell-Video-URL", success: false }, 400);

  const segments = await query<Record<string, unknown>>(sql,
    "SELECT * FROM video_segments WHERE project_id = $1 AND is_included = true ORDER BY segment_index",
    [project_id]
  );
  if (segments.length === 0) return c.json({ error: "Keine Segmente ausgewählt", success: false }, 400);

  await query(sql,
    "UPDATE video_projects SET status = 'rendering', subtitle_style = $1, transition_style = $2 WHERE id = $3",
    [subtitle_style, transition_style, project_id]
  );

  // Build Shotstack edit JSON
  const transitionMap: Record<string, Record<string, unknown> | undefined> = {
    smooth: { in: "fade", out: "fade" },
    fade: { in: "fade" },
    zoom: { in: "zoom" },
    cut: undefined,
  };
  const transition = transitionMap[transition_style];

  const subtitleStyles: Record<string, (text: string) => string> = {
    bold_center: (t) => `<div style="font-family:'Montserrat',sans-serif;font-size:48px;font-weight:800;color:white;text-align:center;text-shadow:2px 2px 8px rgba(0,0,0,0.8);padding:10px 20px;line-height:1.2;max-width:900px;">${t}</div>`,
    bottom_bar: (t) => `<div style="background:rgba(0,0,0,0.7);padding:12px 24px;border-radius:8px;font-family:'Inter',sans-serif;font-size:36px;font-weight:600;color:white;text-align:center;max-width:900px;">${t}</div>`,
    karaoke: (t) => `<div style="font-family:'Montserrat',sans-serif;font-size:44px;font-weight:800;color:#FFD700;text-align:center;text-shadow:2px 2px 6px rgba(0,0,0,0.9);padding:10px 20px;line-height:1.2;max-width:900px;">${t}</div>`,
    minimal: (t) => `<div style="font-family:'Inter',sans-serif;font-size:28px;font-weight:500;color:rgba(255,255,255,0.9);text-align:left;text-shadow:1px 1px 4px rgba(0,0,0,0.6);padding:8px 16px;max-width:900px;">${t}</div>`,
  };
  const buildSubtitle = subtitleStyles[subtitle_style] || subtitleStyles.bold_center;

  let cumulativeStart = 0;
  const videoClips = segments.map((seg) => {
    const duration = ((seg.end_ms as number) - (seg.start_ms as number)) / 1000;
    const clip: Record<string, unknown> = {
      asset: { type: "video", src: project.source_video_url, trim: (seg.start_ms as number) / 1000, volume: 1 },
      start: cumulativeStart,
      length: duration,
      fit: "cover",
    };
    if (transition) clip.transition = transition;
    cumulativeStart += duration;
    return clip;
  });

  const subtitleClips = segments
    .filter((seg) => seg.subtitle_text)
    .map((seg) => {
      const duration = ((seg.end_ms as number) - (seg.start_ms as number)) / 1000;
      let segStart = 0;
      for (const s of segments) {
        if (s.id === seg.id) break;
        segStart += ((s.end_ms as number) - (s.start_ms as number)) / 1000;
      }
      return {
        asset: {
          type: "html",
          html: `<html><body style="margin:0;display:flex;align-items:flex-end;justify-content:center;height:100%;">${buildSubtitle(escapeHtml(seg.subtitle_text as string))}</body></html>`,
          width: 1080,
          height: 400,
        },
        start: segStart,
        length: duration,
        position: "bottom",
        offset: { y: 0.08 },
      };
    });

  const workerUrl = new URL(c.req.url).origin;
  const callbackUrl = `${workerUrl}/api/video/render-callback`;

  const edit = {
    timeline: {
      background: "#000000",
      tracks: [{ clips: subtitleClips }, { clips: videoClips }],
    },
    output: { format: "mp4", resolution: "1080", aspectRatio: "9:16", fps: 30, quality: "high" },
    callback: callbackUrl,
  };

  const renderRes = await fetch("https://api.shotstack.io/edit/v1/render", {
    method: "POST",
    headers: { "x-api-key": c.env.SHOTSTACK_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(edit),
  });

  if (!renderRes.ok) {
    const errText = await renderRes.text();
    await query(sql, "UPDATE video_projects SET status = 'failed', error_message = $1 WHERE id = $2",
      [`Shotstack-Fehler: ${renderRes.status}`, project_id]);
    return c.json({ error: `Shotstack Fehler (${renderRes.status})`, success: false }, 500);
  }

  const renderData = await renderRes.json() as { response?: { id?: string } };
  const renderId = renderData.response?.id;

  if (!renderId) {
    await query(sql, "UPDATE video_projects SET status = 'failed', error_message = 'Keine Render-ID' WHERE id = $1", [project_id]);
    return c.json({ error: "Keine Render-ID erhalten", success: false }, 500);
  }

  await query(sql,
    "INSERT INTO video_renders (project_id, user_id, shotstack_render_id, shotstack_status, config_snapshot) VALUES ($1, $2, $3, 'queued', $4)",
    [project_id, userId, renderId, JSON.stringify(edit)]
  );

  await query(sql, "UPDATE video_projects SET shotstack_render_id = $1 WHERE id = $2", [renderId, project_id]);

  return c.json({ success: true, render_id: renderId, segment_count: segments.length });
});

// ============================================================
// POST /api/video/render-callback (Webhook - no auth)
// ============================================================
app.post("/render-callback", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<{
    id: string;
    status: string;
    url?: string;
    error?: string;
  }>();
  const { id: renderId, status, url } = body;

  if (!renderId) return c.json({ error: "Keine Render-ID" }, 400);

  const render = await queryOne<Record<string, unknown>>(sql,
    "SELECT id, project_id, user_id FROM video_renders WHERE shotstack_render_id = $1",
    [renderId]
  );
  if (!render) return c.json({ error: "Unbekannte Render-ID" }, 404);

  // Idempotency: skip if already processed
  const currentRender = await queryOne<Record<string, unknown>>(sql,
    "SELECT shotstack_status FROM video_renders WHERE id = $1",
    [render.id]
  );
  if (currentRender?.shotstack_status === "done" || currentRender?.shotstack_status === "failed") {
    return c.json({ success: true, status: "already_processed" });
  }

  if (status === "done" && url) {
    // Validate Shotstack URL (should be from shotstack CDN)
    if (!isSafeUrl(url)) {
      await query(sql, "UPDATE video_renders SET shotstack_status = 'failed', error_message = 'Ungültige Video-URL im Callback' WHERE id = $1", [render.id]);
      return c.json({ error: "Ungültige URL" }, 400);
    }

    // Download rendered video
    const videoRes = await fetch(url);
    if (!videoRes.ok) {
      await query(sql, "UPDATE video_renders SET shotstack_status = 'failed', error_message = 'Download fehlgeschlagen' WHERE id = $1", [render.id]);
      await query(sql, "UPDATE video_projects SET status = 'failed', error_message = 'Video-Download fehlgeschlagen' WHERE id = $1", [render.project_id]);
      return c.json({ error: "Download fehlgeschlagen" }, 500);
    }

    const videoBuffer = await videoRes.arrayBuffer();
    const r2Key = `video-assets/${render.user_id}/reels/${render.project_id}/${Date.now()}.mp4`;

    // Upload to R2
    await c.env.R2_BUCKET.put(r2Key, videoBuffer, { httpMetadata: { contentType: "video/mp4" } });
    const publicUrl = `${c.env.R2_PUBLIC_URL}/${r2Key}`;

    await query(sql,
      "UPDATE video_renders SET shotstack_status = 'done', output_url = $1, stored_video_path = $2, stored_video_url = $3, completed_at = NOW() WHERE id = $4",
      [url, r2Key, publicUrl, render.id]
    );
    await query(sql,
      "UPDATE video_projects SET status = 'render_complete', rendered_video_path = $1, rendered_video_url = $2 WHERE id = $3",
      [r2Key, publicUrl, render.project_id]
    );
    await query(sql,
      "INSERT INTO logs (user_id, level, event_type, details) VALUES ($1, 'info', 'reel_render_complete', $2)",
      [render.user_id, JSON.stringify({ project_id: render.project_id, video_url: publicUrl })]
    );
  } else if (status === "failed") {
    const errorMsg = body.error || "Shotstack Rendering fehlgeschlagen";
    await query(sql,
      "UPDATE video_renders SET shotstack_status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2",
      [errorMsg, render.id]
    );
    await query(sql,
      "UPDATE video_projects SET status = 'failed', error_message = $1 WHERE id = $2",
      [errorMsg, render.project_id]
    );
  } else {
    await query(sql, "UPDATE video_renders SET shotstack_status = $1 WHERE id = $2", [status, render.id]);
  }

  return c.json({ success: true, status });
});

export { app as videoRoutes };
