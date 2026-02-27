import "../lib/secrets.ts";
import { db, schema } from "./index.ts";
import { seed, seedServers } from "./seed.ts";
import path from "node:path";
import { readFile } from "node:fs/promises";

const drizzleDir = path.resolve(import.meta.dir, "../../drizzle");
const journal = JSON.parse(await readFile(path.join(drizzleDir, "meta/_journal.json"), "utf-8"));

// Ensure tracking table exists (Drizzle-compatible schema)
db.$client.run(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL UNIQUE,
  created_at INTEGER
)`);

const applied = new Set(
  (db.$client.prepare("SELECT hash FROM __drizzle_migrations").all() as { hash: string }[]).map((r) => r.hash),
);

for (const entry of journal.entries) {
  const tag: string = entry.tag;
  if (applied.has(tag)) continue;

  const sql = await readFile(path.join(drizzleDir, `${tag}.sql`), "utf-8");
  const statements = sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    try {
      db.$client.run(stmt);
    } catch (e: unknown) {
      const msg = (e as Error)?.message ?? "";
      if (msg.includes("already exists") || msg.includes("duplicate column name")) {
      process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: `migrate skip: ${msg.split("\n")[0]}` }) + "\n");
        continue;
      }
      throw e;
    }
  }

  db.$client.prepare("INSERT OR IGNORE INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)").run(tag, Date.now());
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: `migrate applied: ${tag}` }) + "\n");
}

process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: "migrations done" }) + "\n");

await seed();
await seedServers();

// If MC_LOG_PATH is set and there is exactly one server without a logPath, apply it.
const mcLogPath = process.env["MC_LOG_PATH"];
if (mcLogPath) {
  const servers = await db.select({ id: schema.servers.id }).from(schema.servers);
  if (servers.length === 1 && servers[0]) {
    const [row] = await db
      .select({ logPath: schema.servers.logPath })
      .from(schema.servers);
    if (!row?.logPath) {
      await db.update(schema.servers).set({ logPath: mcLogPath });
      process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: `seed MC_LOG_PATH applied: ${mcLogPath}` }) + "\n");
    }
  }
}

process.exit(0);
