import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Shared helpers for Supabase Edge Functions
export function getCorsHeaders() {
  const allowed = Deno.env.get('ALLOWED_ORIGINS');
  if (!allowed) {
    console.warn('[supabase-utils] ALLOWED_ORIGINS not set, defaulting to * (insecure for production)');
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };
  }

  const origins = allowed.split(',').map(s => s.trim());
  return {
    'Access-Control-Allow-Origin': origins.join(','),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

export function handleOptions(req: Request, corsHeaders: Record<string, string>) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

export function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: { headers: { 'x-admin-client': 'creatoros-utils' } }
  });
}

// Sentry init helper (idempotent)
export function initSentryForEdge(sentryDsn?: string) {
  try {
    if (!sentryDsn) return;
    // Lazy import to avoid pulling @sentry/node in environments where it's not configured
    // Note: This import may increase bundle size; only used server-side in functions
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/node');
    if ((globalThis as any).__SENTRY_INITIALIZED) return;
    Sentry.init({ dsn: sentryDsn });
    (globalThis as any).__SENTRY_INITIALIZED = true;
  } catch (e) {
    console.warn('[supabase-utils] Failed to init Sentry:', e);
  }
}

// Note: Never export or leak secrets to client-side bundles.