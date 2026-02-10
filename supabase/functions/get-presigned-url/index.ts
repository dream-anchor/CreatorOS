import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PresignedUrlRequest {
  files: Array<{
    fileName: string;
    contentType: string;
    folder?: string;
  }>;
}

// AWS Signature V4 implementation for presigned URLs
async function createPresignedUrl(
  method: string,
  bucket: string,
  key: string,
  endpoint: string,
  accessKeyId: string,
  secretAccessKey: string,
  contentType: string,
  expiresIn: number = 3600,
): Promise<string> {
  const encoder = new TextEncoder();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";

  const endpointUrl = new URL(endpoint);
  const host = `${bucket}.${endpointUrl.host}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const queryParams: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": expiresIn.toString(),
    "X-Amz-SignedHeaders": "content-type;host",
  };

  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join("&");

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = "content-type;host";

  const canonicalRequest = [
    method,
    "/" + key,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const canonicalRequestHash = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonicalRequest),
  );
  const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalRequestHashHex,
  ].join("\n");

  async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
    const keyBuffer = (key instanceof Uint8Array ? key.buffer : key) as ArrayBuffer;
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  }

  const kDate = await hmacSha256(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");

  const signature = await hmacSha256(kSigning, stringToSign);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `https://${host}/${key}?${canonicalQueryString}&X-Amz-Signature=${signatureHex}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r2Endpoint = Deno.env.get("R2_ENDPOINT");
    const r2AccessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const r2SecretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const r2BucketName = Deno.env.get("R2_BUCKET_NAME");
    const r2PublicUrl = Deno.env.get("R2_PUBLIC_URL");

    if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName || !r2PublicUrl) {
      return new Response(
        JSON.stringify({ success: false, error: "R2-Konfiguration fehlt. Bitte Secrets prüfen." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Nicht autorisiert" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Auth-Fehler" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const userId = authData.user.id;
    const payload: PresignedUrlRequest = await req.json();

    if (!payload.files || payload.files.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Keine Dateien angegeben" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[get-presigned-url] Generating ${payload.files.length} URLs for user ${userId}`);

    const urls = await Promise.all(
      payload.files.map(async (file) => {
        const timestamp = Date.now() + Math.floor(Math.random() * 1000);
        const sanitized = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const folder = file.folder || "videos";
        const r2Key = `${folder}/${userId}/${timestamp}-${sanitized}`;

        const uploadUrl = await createPresignedUrl(
          "PUT",
          r2BucketName,
          r2Key,
          r2Endpoint,
          r2AccessKeyId,
          r2SecretAccessKey,
          file.contentType || "video/mp4",
          3600,
        );

        return {
          fileName: file.fileName,
          uploadUrl,
          publicUrl: `${r2PublicUrl}/${r2Key}`,
          r2Key,
        };
      }),
    );

    console.log(`[get-presigned-url] Generated ${urls.length} presigned URLs`);

    return new Response(
      JSON.stringify({ success: true, urls }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[get-presigned-url] Error:", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
