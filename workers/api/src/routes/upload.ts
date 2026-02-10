import { Hono } from "hono";
import type { Env } from "../index";
import { generatePresignedUrl, deleteFromR2, keyFromPublicUrl } from "../lib/r2";

const app = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

/** POST /api/upload/presign - Generate presigned URLs for R2 uploads */
app.post("/presign", async (c) => {
  const userId = c.get("userId");
  const { files } = await c.req.json<{
    files: Array<{ fileName: string; contentType: string; folder?: string }>;
  }>();

  if (!files || files.length === 0) {
    return c.json({ error: "files array is required" }, 400);
  }

  const urls = await Promise.all(
    files.map(async (file) => {
      const folder = file.folder || "uploads";
      const sanitized = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `${folder}/${userId}/${Date.now()}-${sanitized}`;
      const { uploadUrl, publicUrl } = await generatePresignedUrl(
        c.env,
        key,
        file.contentType
      );
      return { uploadUrl, publicUrl, key };
    })
  );

  return c.json({ success: true, urls });
});

/** POST /api/upload/delete - Delete a file from R2 */
app.post("/delete", async (c) => {
  const { key, publicUrl } = await c.req.json<{
    key?: string;
    publicUrl?: string;
  }>();

  let r2Key = key;
  if (!r2Key && publicUrl) {
    r2Key = keyFromPublicUrl(publicUrl, c.env.R2_PUBLIC_URL);
  }

  if (!r2Key) {
    return c.json({ error: "key or publicUrl is required" }, 400);
  }

  await deleteFromR2(c.env.R2_BUCKET, r2Key);
  return c.json({ success: true });
});

/** GET /api/upload/proxy?key=... - Proxy R2 files with CORS headers */
app.get("/proxy", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "key is required" }, 400);

  const object = await c.env.R2_BUCKET.get(key);
  if (!object) return c.json({ error: "File not found" }, 404);

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Cache-Control", "public, max-age=3600");

  if (object.size) headers.set("Content-Length", String(object.size));

  return new Response(object.body, { headers });
});

export { app as uploadRoutes };
