/**
 * Bootstrap seed:
 *
 * 1. Admin user — from REDSTNKIT_ADMIN_EMAIL / REDSTNKIT_ADMIN_PASSWORD (or *_FILE).
 *    Nothing happens if an admin already exists.
 *
 * 2. Minecraft servers — from MC_SERVERS (JSON array) or MC_SERVERS_FILE.
 *    Format:
 *      MC_SERVERS='[{"name":"Survival","host":"mc1","rconPort":25575,"rconPassword":"secret"}]'
 *    Servers are upserted by name — existing entries are updated in place.
 *    Individual overrides (MC_SERVER_1_NAME / MC_SERVER_1_HOST / ...) are also
 *    supported for up to 9 servers, for Docker-Compose simplicity.
 */

import { readFileSync } from "node:fs";
import { db, schema } from "./index.ts";
import { eq } from "drizzle-orm";
import { auth } from "../auth/index.ts";
import { encrypt } from "../lib/crypto.ts";
import { nanoid } from "nanoid";

function readEnvOrFile(envKey: string, fileEnvKey: string): string | undefined {
  const direct = process.env[envKey];
  if (direct) return direct.trim();

  const filePath = process.env[fileEnvKey];
  if (filePath) {
    try {
      return readFileSync(filePath, "utf8").trim();
    } catch {
      console.error(`[seed] Cannot read ${fileEnvKey}=${filePath}`);
    }
  }
  return undefined;
}

export async function seed() {
  // Check whether any admin already exists
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"))
    .limit(1);

  if (existing.length > 0) {
    // Admin exists — nothing to do
    return;
  }

  const email = readEnvOrFile("REDSTNKIT_ADMIN_EMAIL", "REDSTNKIT_ADMIN_EMAIL_FILE");
  const password = readEnvOrFile("REDSTNKIT_ADMIN_PASSWORD", "REDSTNKIT_ADMIN_PASSWORD_FILE");
  const name = process.env["REDSTNKIT_ADMIN_NAME"] ?? "Admin";

  if (!email || !password) {
    console.warn(
      "[seed] ⚠️  No admin user exists and no credentials provided.\n" +
        "       Set REDSTNKIT_ADMIN_EMAIL and REDSTNKIT_ADMIN_PASSWORD (or *_FILE variants)\n" +
        "       to bootstrap the first admin account automatically."
    );
    return;
  }

  if (password.length < 12) {
    throw new Error(
      "[seed] REDSTNKIT_ADMIN_PASSWORD must be at least 12 characters."
    );
  }

  // Use Better Auth's own sign-up to hash the password and create the account
  const res = await auth.api.signUpEmail({
    body: { email, password, name },
  });

  if (!res?.user?.id) {
    throw new Error("[seed] Failed to create admin user via Better Auth.");
  }

  // Promote to admin role
  await db
    .update(schema.users)
    .set({ role: "admin" })
    .where(eq(schema.users.id, res.user.id));

  console.log(`[seed] ✅ Admin user created: ${email}`);
}

// ── Server seeding ─────────────────────────────────────────────────────────

interface ServerEntry {
  name: string;
  host: string;
  rconPort?: number;
  rconPassword: string;
  dynmapUrl?: string;
  logPath?: string;
}

function readServerEntries(): ServerEntry[] {
  const entries: ServerEntry[] = [];

  // 1. MC_SERVERS / MC_SERVERS_FILE — JSON array
  const raw =
    process.env["MC_SERVERS"] ??
    (() => {
      const file = process.env["MC_SERVERS_FILE"];
      if (file) {
        try { return readFileSync(file, "utf8").trim(); } catch { /* ignore */ }
      }
      return undefined;
    })();

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const s of parsed as ServerEntry[]) {
          if (s.name && s.host && s.rconPassword) entries.push(s);
        }
      }
    } catch {
      console.error("[seed] MC_SERVERS is not valid JSON — skipping JSON server seeding");
    }
  }

  // 2. Individual MC_SERVER_N_* vars (N = 1..9)
  for (let n = 1; n <= 9; n++) {
    const name     = process.env[`MC_SERVER_${n}_NAME`];
    const host     = process.env[`MC_SERVER_${n}_HOST`];
    const password = process.env[`MC_SERVER_${n}_PASSWORD`];
    if (!name || !host || !password) continue;
    const port = Number(process.env[`MC_SERVER_${n}_PORT`] ?? 25575);
    const dynmap = process.env[`MC_SERVER_${n}_DYNMAP`];
    const logPath = process.env[`MC_SERVER_${n}_LOG_PATH`];
    entries.push({ name, host, rconPort: port, rconPassword: password, dynmapUrl: dynmap, logPath });
  }

  return entries;
}

/** Resolve global MC_LOG_PATH fallback into single-server entries that have no logPath. */
function applyLogPathFallback(entries: ServerEntry[]): ServerEntry[] {
  const globalLogPath = process.env["MC_LOG_PATH"];
  if (!globalLogPath || entries.length !== 1) return entries;
  return entries.map((e) => (e.logPath ? e : { ...e, logPath: globalLogPath }));
}

export async function seedServers() {
  const entries = applyLogPathFallback(readServerEntries());
  if (entries.length === 0) return;

  for (const entry of entries) {
    const existing = await db
      .select({ id: schema.servers.id })
      .from(schema.servers)
      .where(eq(schema.servers.name, entry.name))
      .limit(1);

    const rconPasswordEncrypted = await encrypt(entry.rconPassword);

    if (existing.length > 0) {
      // Update host / password in case they changed
      await db
        .update(schema.servers)
        .set({
          host: entry.host,
          rconPort: entry.rconPort ?? 25575,
          rconPasswordEncrypted,
          ...(entry.dynmapUrl ? { dynmapUrl: entry.dynmapUrl } : {}),
          ...(entry.logPath !== undefined ? { logPath: entry.logPath } : {}),
        })
        .where(eq(schema.servers.name, entry.name));
      console.log(`[seed] 🔄  Server updated: ${entry.name}`);
    } else {
      await db.insert(schema.servers).values({
        id: nanoid(),
        name: entry.name,
        host: entry.host,
        rconPort: entry.rconPort ?? 25575,
        rconPasswordEncrypted,
        dynmapUrl: entry.dynmapUrl,
        logPath: entry.logPath,
      });
      console.log(`[seed] ✅  Server seeded: ${entry.name} (${entry.host}:${entry.rconPort ?? 25575})`);
    }
  }
}
