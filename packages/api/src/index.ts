import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { rateLimit } from "elysia-rate-limit";
import { auth } from "./auth/index.ts";
import { securityHeaders } from "./plugins/security.ts";
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
import { startBackupScheduler } from "./lib/backup.ts";
import { existsSync, mkdirSync } from "node:fs";
import { db, schema } from "./db/index.ts";
import { lt } from "drizzle-orm";

// Ensure data directory exists
if (!existsSync("data")) mkdirSync("data", { recursive: true });

// Warn if running in production without HTTPS cookie protection
if (process.env["NODE_ENV"] === "production" && process.env["SECURE_COOKIES"] !== "true") {
  console.warn(
    "⚠️  WARNING: SECURE_COOKIES is not set to 'true'.\n" +
    "   Session cookies are NOT protected against interception.\n" +
    "   Set SECURE_COOKIES=true when running behind an HTTPS reverse proxy."
  );
}

// Prune audit log entries older than 90 days — runs once at startup then daily
async function pruneAuditLog() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await db.delete(schema.auditLog).where(lt(schema.auditLog.createdAt, cutoff));
}
pruneAuditLog().catch(() => {});
setInterval(() => pruneAuditLog().catch(() => {}), 24 * 60 * 60 * 1000);

const PORT = Number(process.env["PORT"] ?? 3001);
const ALLOWED_ORIGIN = process.env["CORS_ORIGIN"] ?? "http://localhost:3001";

export const app = new Elysia()
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
  .use(swagger({ path: "/api/docs", documentation: { info: { title: "RedstnKit API", version: "1.0.0", description: "Minecraft server management dashboard API" } } }))
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

console.log(`🚀 RedstnKit API running on http://localhost:${PORT}`);
console.log(`📖 Swagger docs at http://localhost:${PORT}/api/docs`);

// Start scheduled backup runner
startBackupScheduler();
startTaskScheduler();

// Export the app type for Eden E2E type safety in the web package
// Export the app type for Eden E2E type safety in the web package
export type App = typeof app;
