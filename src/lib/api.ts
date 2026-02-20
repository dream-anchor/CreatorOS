/**
 * Central API client for CreatorOS.
 * Replaces all supabase.from(), supabase.functions.invoke(), and supabase.storage calls.
 */

const API_BASE = import.meta.env.VITE_API_URL || "";

/** Get the current auth token from Stack Auth */
async function getAuthToken(): Promise<string | null> {
  // Stack Auth stores the token - we read it from the auth module
  const { getToken } = await import("./auth");
  return getToken();
}

/** Core fetch wrapper with auth */
export async function apiFetch<T = unknown>(
  path: string,
  options?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  if (!options?.skipAuth) {
    const token = await getAuthToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg: string;
    try {
      const errorData = await res.json();
      errorMsg = errorData.error || errorData.message || `API Error ${res.status}`;
    } catch {
      errorMsg = `API Error ${res.status}`;
    }
    throw new Error(errorMsg);
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json();
  }
  return res.text() as unknown as T;
}

// ============================================================
// Convenience methods (replace supabase.from() patterns)
// ============================================================

/** GET request */
export function apiGet<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  const searchParams = params ? "?" + new URLSearchParams(params).toString() : "";
  return apiFetch<T>(`${path}${searchParams}`);
}

/** POST request with JSON body */
export function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** PATCH request with JSON body */
export function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** DELETE request */
export function apiDelete<T = unknown>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" });
}

// ============================================================
// Edge Function replacement (replaces supabase.functions.invoke)
// ============================================================

/**
 * Invoke a backend function.
 * Maps old Supabase function names to new API paths.
 */
const FUNCTION_MAP: Record<string, string> = {
  // Posts
  "generate-draft": "/api/posts/generate-draft",
  "generate-hashtags": "/api/posts/generate-hashtags",
  "generate-asset": "/api/posts/generate-asset",
  "classify-post-content": "/api/posts/classify",
  "analyze-style": "/api/posts/analyze-style",
  "analyze-reply-style": "/api/posts/analyze-reply-style",
  "repair-post-metadata": "/api/posts/repair-metadata",
  "generate-community-reply": "/api/posts/generate-reply",

  // Media
  "analyze-media-vision": "/api/media/analyze-vision",
  "process-smart-upload": "/api/media/smart-upload",
  "refresh-media-url": "/api/media/refresh-url",

  // Upload
  "get-presigned-url": "/api/upload/presign",
  "delete-from-r2": "/api/upload/delete",

  // Video
  "analyze-video-frames": "/api/video/analyze-frames",
  "transcribe-video": "/api/video/transcribe",
  "select-reel-segments": "/api/video/select-segments",
  "render-reel": "/api/video/render",

  // Instagram
  "instagram-auth": "/api/instagram/auth",
  "fetch-instagram-history": "/api/instagram/fetch-history",
  "publish-to-instagram": "/api/instagram/publish",
  "store-instagram-token": "/api/instagram/store-token",
  "test-instagram-connection": "/api/instagram/test-connection",
  "test-instagram-post": "/api/instagram/test-connection", // reuse
  "validate-instagram-user": "/api/instagram/validate-user",
  "meta-oauth-config": "/api/instagram/oauth-config",

  // Community
  "fetch-comments": "/api/community/fetch-comments",
  "analyze-comments": "/api/community/analyze-comments",
  "batch-generate-replies": "/api/community/batch-generate-replies",
  "reply-to-comment": "/api/community/reply",
  "moderate-comment": "/api/community/moderate",
  "regenerate-reply": "/api/community/regenerate-reply",

  // Analytics
  "fetch-daily-insights": "/api/analytics/fetch-daily-insights",

  // Training / Topics
  "topic-research": "/api/training/topic-research",
  "manage-training-data": "/api/training",

  // Chat
  "copilot-chat": "/api/chat/copilot",

  // Cron (internal)
  "process-reply-queue": "/api/cron/process-reply-queue",
  "scheduler-tick": "/api/cron/scheduler-tick",
  "backfill-likes": "/api/cron/backfill-likes",
  "refresh-instagram-token": "/api/cron/refresh-tokens",

  // Settings
  "get-shortcut-api-key": "/api/settings/shortcut-api-key",
  "check-permissions": "/api/instagram/test-connection",
};

/**
 * Drop-in replacement for supabase.functions.invoke().
 * Usage: const { data, error } = await invokeFunction("generate-draft", { body: {...} });
 */
export async function invokeFunction<T = any>(
  functionName: string,
  options?: { body?: unknown }
): Promise<{ data: T | null; error: Error | null }> {
  const path = FUNCTION_MAP[functionName];
  if (!path) {
    console.warn(`[api] Unknown function: ${functionName}`);
    return { data: null, error: new Error(`Unknown function: ${functionName}`) };
  }

  try {
    const data = await apiPost<T>(path, options?.body);
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ============================================================
// Storage replacement (replaces supabase.storage)
// ============================================================

/**
 * Get a presigned upload URL for R2.
 */
export async function getPresignedUrl(
  files: Array<{ fileName: string; contentType: string; folder?: string }>
): Promise<{ urls: Array<{ uploadUrl: string; publicUrl: string; key: string }> }> {
  return apiPost("/api/upload/presign", { files });
}

/**
 * Upload a file using a presigned URL.
 */
export async function uploadToR2(
  uploadUrl: string,
  file: File | Blob,
  contentType: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      };
    }

    xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

/**
 * Delete a file from R2.
 */
export async function deleteFromR2(key?: string, publicUrl?: string): Promise<void> {
  await apiPost("/api/upload/delete", { key, publicUrl });
}
