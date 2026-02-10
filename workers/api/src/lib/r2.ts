import type { Env } from "../index";

/**
 * Generate a presigned PUT URL for R2 using AWS Signature V4.
 * This is needed for client-side uploads.
 */
export async function generatePresignedUrl(
  env: Env,
  key: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucketName = "creatoros-storage";

  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const dateDay = dateStr.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const credentialScope = `${dateDay}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const jurisdiction = env.R2_JURISDICTION ? `${env.R2_JURISDICTION}.` : "";
  const host = `${accountId}.${jurisdiction}r2.cloudflarestorage.com`;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": dateStr,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "content-type;host",
  });
  queryParams.sort();

  const canonicalRequest = [
    "PUT",
    `/${bucketName}/${encodedKey}`,
    queryParams.toString(),
    `content-type:${contentType}\nhost:${host}\n`,
    "content-type;host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    dateStr,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await getSigningKey(secretAccessKey, dateDay, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  queryParams.set("X-Amz-Signature", signature);

  const uploadUrl = `https://${host}/${bucketName}/${encodedKey}?${queryParams.toString()}`;
  const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;

  return { uploadUrl, publicUrl };
}

/** Delete a file from R2 using the R2 binding */
export async function deleteFromR2(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key);
}

/** Extract R2 key from a public URL */
export function keyFromPublicUrl(publicUrl: string, r2PublicBase: string): string {
  return publicUrl.replace(r2PublicBase + "/", "");
}

// --- Crypto helpers ---

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return bufToHex(hash);
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function hmacHex(key: ArrayBuffer, data: string): Promise<string> {
  return bufToHex(await hmac(key, data));
}

async function getSigningKey(
  secretKey: string,
  dateDay: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  let key: ArrayBuffer = new TextEncoder().encode(`AWS4${secretKey}`).buffer as ArrayBuffer;
  for (const part of [dateDay, region, service, "aws4_request"]) {
    key = await hmac(key, part);
  }
  return key;
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
