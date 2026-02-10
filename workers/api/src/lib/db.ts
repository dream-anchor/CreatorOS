import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

/** Get a Neon SQL tagged template function. Reuses the connection within a request. */
export function getDb(databaseUrl: string) {
  if (!_sql) {
    _sql = neon(databaseUrl);
  }
  return _sql;
}

/**
 * Helper: Run a query and return rows.
 * Usage: const rows = await query(sql, "SELECT * FROM posts WHERE user_id = $1", [userId]);
 */
export async function query<T = Record<string, unknown>>(
  sql: NeonQueryFunction<false, false>,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await sql(text, params);
  return result as T[];
}

/**
 * Helper: Run a query and return the first row or null.
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: NeonQueryFunction<false, false>,
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, text, params);
  return rows[0] ?? null;
}
