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

// Public routes (webhooks, callbacks, cron) - no auth required
app.route("/api/video", videoRoutes); // render-callback is public, others are protected inside
app.route("/api/instagram", instagramRoutes); // oauth callback is public
app.route("/api/cron", cronRoutes); // cron jobs are public (use secret header)

// Protected routes - require auth
app.use("/api/*", authMiddleware());
app.route("/api/upload", uploadRoutes);
app.route("/api/posts", postsRoutes);
app.route("/api/media", mediaRoutes);
app.route("/api/community", communityRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api/training", trainingRoutes);
app.route("/api/calendar", calendarRoutes);
app.route("/api/chat", chatRoutes);
app.route("/api/settings", settingsRoutes);

// Health check
app.get("/", (c) => c.json({ status: "ok", service: "creatoros-api" }));

export default app;
