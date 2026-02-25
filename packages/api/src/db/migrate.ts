import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { db, schema } from "./index.ts";
import { seed, seedServers } from "./seed.ts";
import { isNull } from "drizzle-orm";
import path from "node:path";

await migrate(db, {
  migrationsFolder: path.resolve(import.meta.dir, "../../drizzle"),
});

console.log("✅ Migrations applied");

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
      console.log(`[seed] 🗂  Applied MC_LOG_PATH fallback: ${mcLogPath}`);
    }
  }
}

process.exit(0);
