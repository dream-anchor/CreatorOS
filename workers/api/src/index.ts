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

export default app;
