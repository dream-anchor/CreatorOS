import { Hono } from "hono";
import { cors } from "./middleware/cors";
import { authMiddleware } from "./middleware/auth";

// Route imports
import { uploadRoutes } from "./routes/upload";
import { postsRoutes } from "./routes/posts";
import { mediaRoutes } from "./routes/media";
import { videoRoutes } from "./routes/video";
import { instagramRoutes } from "./routes/instagram";
import { communityRoutes } from "./routes/community";
import { analyticsRoutes } from "./routes/analytics";
import { trainingRoutes } from "./routes/training";
import { calendarRoutes } from "./routes/calendar";
import { chatRoutes } from "./routes/chat";
import { settingsRoutes } from "./routes/settings";
import { cronRoutes } from "./routes/cron";
import { eventsRoutes } from "./routes/events";

export type Env = {
  R2_BUCKET: R2Bucket;
  DATABASE_URL: string;
  OPENAI_API_KEY: string;
  SHOTSTACK_API_KEY: string;
  INSTAGRAM_APP_ID: string;
  INSTAGRAM_APP_SECRET: string;
  NEON_AUTH_URL: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_PUBLIC_URL: string;
  ENVIRONMENT: string;
  R2_JURISDICTION: string;
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  TROUPE_SUPABASE_URL: string;
  TROUPE_SUPABASE_KEY: string;
};

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// Global CORS
app.use("*", cors());

// Auth middleware for all /api/* routes (PUBLIC_PATHS are skipped inside)
app.use("/api/*", authMiddleware());

// All routes - auth exceptions handled by PUBLIC_PATHS in auth middleware
app.route("/api/upload", uploadRoutes);
app.route("/api/posts", postsRoutes);
app.route("/api/media", mediaRoutes);
app.route("/api/video", videoRoutes);
app.route("/api/instagram", instagramRoutes);
app.route("/api/community", communityRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/training", trainingRoutes);
app.route("/api/calendar", calendarRoutes);
app.route("/api/chat", chatRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/cron", cronRoutes);
app.route("/api/events", eventsRoutes);

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "creatoros-api" }));

// Global error handler
app.onError((err, c) => {
  console.error(`[error] ${c.req.method} ${c.req.path}:`, err.message);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const base = "https://creatoros-api.antoine-dfc.workers.dev";
    console.log(`[cron] Triggered: ${event.cron} at ${new Date().toISOString()}`);

    if (event.cron === "0 7 * * *") {
      // Täglich 09:00 CET: Event-Posts generieren
      const req = new Request(`${base}/api/cron/auto-generate-event-posts`, { method: "POST" });
      const res = await app.fetch(req, env, ctx);
      console.log(`[cron] auto-generate ${res.status}: ${await res.text()}`);
    }

    // Alle 15 Min (inkl. 07:00): Scheduled Posts auf Instagram publishen
    const tickReq = new Request(`${base}/api/cron/scheduler-tick`, { method: "POST" });
    const tickRes = await app.fetch(tickReq, env, ctx);
    console.log(`[cron] scheduler-tick ${tickRes.status}: ${await tickRes.text()}`);
  },
};
