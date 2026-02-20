#!/usr/bin/env node
/**
 * Run SQL migration against Neon PostgreSQL.
 * Usage: DATABASE_URL="postgresql://..." node scripts/run-migration.mjs scripts/migrations/001_events.sql
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "../workers/api/node_modules/") + "/");
const { neon } = require("@neondatabase/serverless");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_zwXUkax95cmy@ep-icy-hat-age20swm-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require";

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: node scripts/run-migration.mjs <path-to-sql>");
  process.exit(1);
}

const sqlContent = readFileSync(resolve(sqlFile), "utf-8");

// Strip comment-only lines, then split into statements
const cleanedSql = sqlContent
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const statements = cleanedSql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const sql = neon(DATABASE_URL);

console.log(`Running migration: ${sqlFile}`);
console.log(`Statements: ${statements.length}`);
console.log("");

let success = 0;
let errors = 0;

for (const stmt of statements) {
  const preview = stmt.substring(0, 80).replace(/\n/g, " ");
  try {
    await sql(stmt);
    console.log(`  OK: ${preview}...`);
    success++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // "already exists" is fine for IF NOT EXISTS statements
    if (msg.includes("already exists") || msg.includes("does not exist")) {
      console.log(`  SKIP: ${preview}... (${msg.split("\n")[0]})`);
      success++;
    } else {
      console.error(`  FAIL: ${preview}...`);
      console.error(`        ${msg.split("\n")[0]}`);
      errors++;
    }
  }
}

console.log("");
console.log(`Done: ${success} ok, ${errors} errors`);
process.exit(errors > 0 ? 1 : 0);
