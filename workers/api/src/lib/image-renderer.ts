import type { Env } from "../index";

/**
 * Rendert HTML zu PNG via Cloudflare Browser Rendering REST API.
 * Gibt ArrayBuffer (PNG) zurück oder null bei Fehler.
 */
export async function renderHtmlToImage(
  env: Env,
  html: string
): Promise<ArrayBuffer | null> {
  const accountId = env.CF_ACCOUNT_ID;
  const apiToken = env.CF_API_TOKEN;

  if (!accountId || !apiToken) {
    console.error("[image-renderer] CF_ACCOUNT_ID oder CF_API_TOKEN nicht gesetzt");
    return null;
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/screenshot`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        html,
        screenshotOptions: {
          type: "png",
          clip: { x: 0, y: 0, width: 1080, height: 1080 },
        },
        viewport: { width: 1080, height: 1080 },
        gotoOptions: {
          waitUntil: "networkidle0",
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error(
      `[image-renderer] CF Browser Rendering error (${res.status}): ${errText}`
    );
    return null;
  }

  return res.arrayBuffer();
}
