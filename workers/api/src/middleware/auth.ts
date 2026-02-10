import type { MiddlewareHandler } from "hono";
import * as jose from "jose";

// Cache the JWKS for Neon Auth
let cachedJWKS: jose.JSONWebKeySet | null = null;
let jwksFetchedAt = 0;
const JWKS_CACHE_MS = 60 * 60 * 1000; // 1 hour

// Routes that skip auth (webhooks, public callbacks)
const PUBLIC_PATHS = [
  "/api/video/render-callback",
  "/api/instagram/callback",
  "/api/instagram/oauth-config",
  "/api/upload/proxy",
  "/api/cron/",
];

export function authMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const path = new URL(c.req.url).pathname;

    // Skip auth for public paths
    if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
      return next();
    }

    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Nicht autorisiert" }, 401);
    }

    const token = authHeader.slice(7);
    const neonAuthUrl = c.env.NEON_AUTH_URL;

    try {
      // Fetch JWKS from Neon Auth if not cached
      if (!cachedJWKS || Date.now() - jwksFetchedAt > JWKS_CACHE_MS) {
        const jwksUrl = `${neonAuthUrl}/.well-known/jwks.json`;
        const res = await fetch(jwksUrl);
        if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
        cachedJWKS = await res.json();
        jwksFetchedAt = Date.now();
      }

      const JWKS = jose.createLocalJWKSet(cachedJWKS!);
      const { payload } = await jose.jwtVerify(token, JWKS);

      const userId = payload.sub;
      if (!userId) {
        return c.json({ error: "Invalid token: no user ID" }, 401);
      }

      c.set("userId", userId);
      return next();
    } catch (err) {
      console.error("[auth] JWT verification failed:", err);
      return c.json({ error: "Auth-Fehler" }, 401);
    }
  };
}
