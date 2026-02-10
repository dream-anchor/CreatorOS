import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AWS Signature V4 for DELETE requests
async function createAwsSignature(
  method: string,
  url: URL,
  headers: Record<string, string>,
  payloadHash: string,
  accessKeyId: string,
  secretAccessKey: string,
): Promise<Record<string, string>> {
  const encoder = new TextEncoder();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";

  const signedHeaders = Object.keys(headers).sort().join(";").toLowerCase();
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}\n`)
    .join("");

  const canonicalRequest = [
    method,
    url.pathname,
    url.search.slice(1) || "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalRequest));
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

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;

  return {
    ...headers,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Authorization: authorization,
  };
}

function extractR2Key(filePath: string, publicUrl: string): string | null {
  if (filePath.startsWith(publicUrl)) {
    return filePath.slice(publicUrl.length + 1);
  }
  if (filePath.includes("r2.dev/")) {
    const match = filePath.match(/r2\.dev\/(.+)$/);
    return match ? match[1] : null;
  }
  // Assume it's already a key
  if (!filePath.startsWith("http")) return filePath;
  return null;
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

    if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !r2BucketName) {
      return new Response(
        JSON.stringify({ success: false, error: "R2-Konfiguration fehlt" }),
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

    const body = await req.json();
    const { fileKeys } = body as { fileKeys: string[] };

    if (!fileKeys || fileKeys.length === 0) {
      return new Response(
        JSON.stringify({ success: true, deleted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[delete-from-r2] Deleting ${fileKeys.length} files`);

    let deletedCount = 0;
    const errors: string[] = [];

    const emptyHash = await crypto.subtle.digest("SHA-256", new Uint8Array(0));
    const emptyHashHex = Array.from(new Uint8Array(emptyHash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    for (const filePath of fileKeys) {
      const r2Key = extractR2Key(filePath, r2PublicUrl || "");
      if (!r2Key) {
        console.log(`[delete-from-r2] Skipping: ${filePath}`);
        continue;
      }

      try {
        const r2Url = new URL(`${r2Endpoint}/${r2BucketName}/${r2Key}`);
        const signedHeaders = await createAwsSignature(
          "DELETE",
          r2Url,
          { Host: r2Url.host },
          emptyHashHex,
          r2AccessKeyId,
          r2SecretAccessKey,
        );

        const resp = await fetch(r2Url.toString(), { method: "DELETE", headers: signedHeaders });
        if (resp.ok || resp.status === 404) {
          console.log(`[delete-from-r2] Deleted: ${r2Key}`);
          deletedCount++;
        } else {
          const errText = await resp.text();
          console.error(`[delete-from-r2] Failed ${r2Key}: ${resp.status} ${errText}`);
          errors.push(`${r2Key}: ${resp.status}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${r2Key}: ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({ success: errors.length === 0, deleted: deletedCount, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[delete-from-r2] Error:", errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
