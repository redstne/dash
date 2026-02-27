/**
 * Auto-generate and persist BETTER_AUTH_SECRET and ENCRYPTION_KEY on first
 * start so users don't need to set them manually.
 *
 * Secrets are stored in `data/.secrets` (JSON, inside the data volume so they
 * survive container restarts). Explicit env vars always take precedence.
 *
 * Import this module FIRST in index.ts — it runs synchronously as a side
 * effect so env vars are set before any other module reads them.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SECRETS_PATH = path.resolve(
  process.env["DB_PATH"]
    ? path.dirname(process.env["DB_PATH"])
    : "data",
  ".secrets"
);

interface Secrets {
  BETTER_AUTH_SECRET?: string;
  ENCRYPTION_KEY?: string;
}

function randomHex(bytes: number): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("hex");
}

function randomBase64(bytes: number): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64");
}

function jsonLog(level: string, msg: string) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, msg }) + "\n");
}

// ── Run synchronously at module load ────────────────────────────────────────
let stored: Secrets = {};

if (existsSync(SECRETS_PATH)) {
  try {
    stored = JSON.parse(readFileSync(SECRETS_PATH, "utf-8")) as Secrets;
  } catch {
    jsonLog("warn", "secrets file unreadable — regenerating");
  }
}

let changed = false;

if (!process.env["BETTER_AUTH_SECRET"]) {
  if (!stored.BETTER_AUTH_SECRET) {
    stored.BETTER_AUTH_SECRET = randomBase64(32);
    changed = true;
    jsonLog("info", "generated BETTER_AUTH_SECRET (stored in data/.secrets)");
  }
  process.env["BETTER_AUTH_SECRET"] = stored.BETTER_AUTH_SECRET;
}

if (!process.env["ENCRYPTION_KEY"]) {
  if (!stored.ENCRYPTION_KEY) {
    stored.ENCRYPTION_KEY = randomHex(32); // 64 hex chars = 32 bytes
    changed = true;
    jsonLog("info", "generated ENCRYPTION_KEY (stored in data/.secrets)");
  }
  process.env["ENCRYPTION_KEY"] = stored.ENCRYPTION_KEY;
}

if (changed) {
  try {
    writeFileSync(SECRETS_PATH, JSON.stringify(stored, null, 2), { mode: 0o600 });
  } catch (e) {
    jsonLog("error", `failed to persist secrets — set BETTER_AUTH_SECRET and ENCRYPTION_KEY env vars manually: ${(e as Error).message}`);
  }
}
