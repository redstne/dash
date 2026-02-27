// Must be the very first import — runs synchronously to set BETTER_AUTH_SECRET
// and ENCRYPTION_KEY from data/.secrets before any other module reads them.
import "./lib/secrets.ts";

import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { rateLimit } from "elysia-rate-limit";
import { auth } from "./auth/index.ts";
import { securityHeaders } from "./plugins/security.ts";
import { loggerPlugin } from "./plugins/logger.ts";
import { serversRoute } from "./modules/servers/index.ts";
import { consoleRoute, playersRoute } from "./modules/console/index.ts";
import { filesRoute } from "./modules/files/index.ts";
import { membersRoute, auditRoute } from "./modules/members/index.ts";
import { analyticsRoute } from "./modules/analytics/index.ts";
import { backupsRoute } from "./modules/backups/index.ts";
import { modsRoute } from "./modules/mods/index.ts";
import { runtimeRoute } from "./modules/runtime/index.ts";
import { scheduleRoute, startTaskScheduler } from "./modules/schedule/index.ts";
import { webhooksRoute } from "./modules/webhooks/index.ts";
import { whitelistRoute } from "./modules/whitelist/index.ts";
import { resourcesRoute } from "./modules/resources/index.ts";
import { logsRoute, logsTailRoute } from "./modules/logs/index.ts";
import { playersManagementRoute } from "./modules/players/index.ts";
import { worldsRoute } from "./modules/worlds/index.ts";
import { getServerStatus } from "./lib/rcon.ts";
import { startBackupScheduler } from "./lib/backup.ts";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { db, schema } from "./db/index.ts";
import { lt, eq } from "drizzle-orm";

// Ensure data directory exists
if (!existsSync("data")) mkdirSync("data", { recursive: true });

// Warn if running in production without HTTPS cookie protection
if (process.env["NODE_ENV"] === "production" && process.env["SECURE_COOKIES"] !== "true") {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg: "SECURE_COOKIES not set — session cookies are unprotected. Set SECURE_COOKIES=true behind HTTPS." }) + "\n");
}

// Prune audit log entries older than 90 days — runs once at startup then daily
async function pruneAuditLog() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await db.delete(schema.auditLog).where(lt(schema.auditLog.createdAt, cutoff));
}
pruneAuditLog().catch(() => {});
setInterval(() => pruneAuditLog().catch(() => {}), 24 * 60 * 60 * 1000);

// Ensure redstne-plugins.txt exists for every server that has a logPath
// so the itzg container doesn't error on startup when PLUGINS_FILE is set.
async function ensurePluginManifests() {
  const servers = await db.select({ logPath: schema.servers.logPath }).from(schema.servers);
  for (const s of servers) {
    if (!s.logPath) continue;
    try {
      const parts = s.logPath.split("/");
      const logsIdx = parts.lastIndexOf("logs");
      if (logsIdx === -1) continue;
      const serverRoot = parts.slice(0, logsIdx).join("/") || "/";
      const manifestPath = `${serverRoot}/redstne-plugins.txt`;
      if (!existsSync(manifestPath)) {
        writeFileSync(manifestPath, "# redstne.dash managed plugin list\n# Install plugins from the dashboard to populate this file.\n", "utf-8");
      }
    } catch { /* best effort */ }
  }
}
ensurePluginManifests().catch(() => {});

const PORT = Number(process.env["PORT"] ?? 3001);
const ALLOWED_ORIGIN = process.env["BASE_URL"] ?? `http://localhost:${PORT}`;

export const app = new Elysia()
  // ── Logging ──────────────────────────────────────────────────────────────
  .use(loggerPlugin)
  // ── Security ────────────────────────────────────────────────────────────
  .use(securityHeaders)
  .use(
    cors({
      origin: ALLOWED_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    })
  )
  .use(
    rateLimit({
      duration: 60_000,
      max: 120,
      errorResponse: new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }),
    })
  )
  // ── API docs ─────────────────────────────────────────────────────────────
  .use(swagger({ path: "/api/docs", documentation: { info: { title: "redstne API", version: "1.0.0", description: "Minecraft server management dashboard API" } } }))
  // ── Better Auth handler ───────────────────────────────────────────────────
  // Elysia's global hooks consume request.body before our handler runs.
  // We re-serialise from the already-parsed `body` context value so Better
  // Auth gets a fresh, readable stream.
  .post(
    "/api/auth/*",
    ({ request, body }) =>
      auth.handler(
        new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: body != null ? JSON.stringify(body) : null,
        })
      ),
    { type: "json" }
  )
  .get("/api/auth/*", ({ request }) => auth.handler(request))
  // ── Feature routes ──────────────────────────────────────────────────────
  .use(serversRoute)
  .use(consoleRoute)
  .use(playersRoute)
  .use(filesRoute)
  .use(membersRoute)
  .use(auditRoute)
  .use(analyticsRoute)
  .use(backupsRoute)
  .use(modsRoute)
  .use(runtimeRoute)
  .use(scheduleRoute)
  .use(webhooksRoute)
  .use(whitelistRoute)
  .use(resourcesRoute)
  .use(logsRoute)
  .use(logsTailRoute)
  .use(playersManagementRoute)
  .use(worldsRoute)
  // ── Public status endpoint (no auth) ──────────────────────────────────────
  .get("/api/public/:serverId/status", async ({ params }) => {
    const [server] = await db
      .select({ id: schema.servers.id, name: schema.servers.name, host: schema.servers.host })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.serverId))
      .limit(1);
    if (!server) return { error: "Not found" };
    try {
      const st = await getServerStatus(server.id);
      return { name: server.name, host: server.host, ...st };
    } catch {
      return { name: server.name, host: server.host, online: false, players: [], playerCount: 0, maxPlayers: 0, tps: null };
    }
  })
  // ── Health check ─────────────────────────────────────────────────────────
  .get("/api/health", () => ({ status: "ok", ts: Date.now() }))
  // ── Serve built React SPA (production) ───────────────────────────────────
  // Explicit asset routes so /api/* is never shadowed by a wildcard plugin.
  .get("/assets/*", ({ params }) =>
    Bun.file(`public/assets/${(params as { "*": string })["*"]}`)
  )
  .get("/favicon.svg", () => Bun.file("public/favicon.svg"))
  .get("/favicon.ico", () => Bun.file("public/favicon.ico"))
  // Root and SPA deep-link fallback — must be last
  .get("/", () => Bun.file("public/index.html"))
  .get("/*", () => Bun.file("public/index.html"))
  .listen(PORT);

process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg: `redstne API running on http://localhost:${PORT}`, port: PORT, docs: `/api/docs` }) + "\n");

// Start scheduled backup runner
startBackupScheduler();
startTaskScheduler();

// Export the app type for Eden E2E type safety in the web package
// Export the app type for Eden E2E type safety in the web package
export type App = typeof app;
