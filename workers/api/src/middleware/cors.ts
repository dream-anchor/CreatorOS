import type { MiddlewareHandler } from "hono";

export function cors(): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey, x-cron-secret",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    await next();

    c.header("Access-Control-Allow-Origin", "*");
  };
}
