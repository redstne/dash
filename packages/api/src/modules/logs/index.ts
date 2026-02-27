/**
 * Server logs API.
 * Lists all log files in the server's logs/ directory and serves their content.
 * Historical logs are .log.gz and are decompressed on the fly.
 * Content is always read-only.
 */

import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../../plugins/rbac.ts";
import { readdir, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs";
import { createGunzip } from "node:zlib";
import path from "node:path";
import { db, schema } from "../../db/index.ts";
import { eq } from "drizzle-orm";

const MAX_LINES = 10_000;

// ── Helpers ───────────────────────────────────────────────────────────────

function deriveServerRoot(logPath: string): string {
  const parts = logPath.split("/");
  const logsIdx = parts.lastIndexOf("logs");
  if (logsIdx === -1) throw new Error("Cannot derive server root from logPath");
  return parts.slice(0, logsIdx).join("/") || "/";
}

async function getLogsDir(serverId: string): Promise<string | null> {
  const [server] = await db
    .select({ logPath: schema.servers.logPath })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (!server?.logPath) return null;
  const root = deriveServerRoot(server.logPath);
  return path.join(root, "logs");
}

/** Read and return last `maxLines` lines from a plain .log file */
async function readPlainLog(filePath: string, maxLines: number): Promise<string[]> {
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  return lines.slice(-maxLines);
}

/** Decompress and return last `maxLines` lines from a .log.gz file */
async function readGzipLog(filePath: string, maxLines: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    let partial = "";

    const stream = createReadStream(filePath).pipe(createGunzip());
    stream.setEncoding("utf8");

    stream.on("data", (chunk: string) => {
      const text = partial + chunk;
      const split = text.split("\n");
      partial = split.pop() ?? "";
      lines.push(...split.filter(Boolean));
      // Keep a rolling buffer to avoid excessive memory
      if (lines.length > maxLines * 2) lines.splice(0, lines.length - maxLines);
    });

    stream.on("end", () => {
      if (partial) lines.push(partial);
      resolve(lines.slice(-maxLines));
    });

    stream.on("error", reject);
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────

export const logsRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  .use(requireRole("viewer"))

  /** List all log files for a server */
  .get("/:id/logs", async ({ params }) => {
    const logsDir = await getLogsDir(params.id);
    if (!logsDir || !existsSync(logsDir)) {
      return { files: [] };
    }

    const entries = await readdir(logsDir);
    const files = await Promise.all(
      entries
        .filter((e) => e === "latest.log" || e.endsWith(".log.gz") || e.endsWith(".log"))
        .map(async (name) => {
          const filePath = path.join(logsDir, name);
          const info = await stat(filePath).catch(() => null);
          return {
            name,
            size: info?.size ?? 0,
            mtime: info?.mtime.toISOString() ?? null,
            compressed: name.endsWith(".gz"),
            isLatest: name === "latest.log",
          };
        })
    );

    // Sort: latest.log first, then newest date first
    files.sort((a, b) => {
      if (a.isLatest) return -1;
      if (b.isLatest) return 1;
      return (b.mtime ?? "").localeCompare(a.mtime ?? "");
    });

    return { files };
  })

  /** Get content of a specific log file */
  .get(
    "/:id/logs/content",
    async ({ params, query, set }) => {
      const logsDir = await getLogsDir(params.id);
      if (!logsDir) return set.status = 404;

      // Prevent directory traversal
      const safeName = path.basename(query.file);
      if (!safeName || safeName !== query.file) {
        set.status = 400;
        return { error: "Invalid filename" };
      }

      const filePath = path.join(logsDir, safeName);
      if (!filePath.startsWith(logsDir) || !existsSync(filePath)) {
        set.status = 404;
        return { error: "File not found" };
      }

      const tail = Math.min(Math.max(1, query.tail ?? MAX_LINES), MAX_LINES);

      try {
        const lines = safeName.endsWith(".gz")
          ? await readGzipLog(filePath, tail)
          : await readPlainLog(filePath, tail);

        return { lines, file: safeName, truncated: lines.length === tail };
      } catch (err) {
        set.status = 500;
        return { error: String(err) };
      }
    },
    {
      query: t.Object({
        file: t.String(),
        tail: t.Optional(t.Number()),
      }),
    }
  );

// ── Live log tail WebSocket ─────────────────────────────────────────────────
// Subscribers per serverId: Set of sender functions
const logTailSubs = new Map<string, Set<(line: string) => void>>();

interface LogTailerState { stop: () => void }
const activeTailers = new Map<string, LogTailerState>();

function startTailer(serverId: string, logPath: string) {
  if (activeTailers.has(serverId)) return;
  let position = 0;
  try { position = fs.statSync(logPath).size; } catch { return; }

  const iv = setInterval(() => {
    const subs = logTailSubs.get(serverId);
    if (!subs || subs.size === 0) return;
    let size!: number;
    try { size = fs.statSync(logPath).size; } catch { return; }
    if (size <= position) return;
    const fd = fs.openSync(logPath, "r");
    const buf = Buffer.alloc(size - position);
    fs.readSync(fd, buf, 0, buf.length, position);
    fs.closeSync(fd);
    position = size;
    for (const line of buf.toString("utf8").split("\n").filter((l) => l.trim())) {
      for (const send of subs) send(line);
    }
  }, 500);

  activeTailers.set(serverId, { stop: () => clearInterval(iv) });
}

async function ensureTailer(serverId: string) {
  if (activeTailers.has(serverId)) return;
  const [server] = await db
    .select({ logPath: schema.servers.logPath })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (server?.logPath) startTailer(serverId, server.logPath);
}

export const logsTailRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  /** WebSocket: live tail of latest.log — read-only, viewer role */
  .ws("/:id/logs/tail", {
    async open(ws) {
      if (!ws.data.session?.user) { ws.close(); return; }
      const serverId = ws.data.params.id;
      if (!logTailSubs.has(serverId)) logTailSubs.set(serverId, new Set());

      // Send last 200 lines of current file immediately
      const [server] = await db
        .select({ logPath: schema.servers.logPath })
        .from(schema.servers)
        .where(eq(schema.servers.id, serverId))
        .limit(1);
      if (server?.logPath) {
        const root = (() => {
          const parts = server.logPath.split("/");
          const idx = parts.lastIndexOf("logs");
          return idx !== -1 ? parts.slice(0, idx).join("/") || "/" : null;
        })();
        if (root) {
          const latestPath = path.join(root, "logs", "latest.log");
          try {
            const lines = await readPlainLog(latestPath, 200);
            ws.send(JSON.stringify({ type: "history", lines }));
          } catch { /* file might not exist */ }
        }
      }

      const send = (line: string) => ws.send(JSON.stringify({ type: "line", data: line }));
      logTailSubs.get(serverId)!.add(send);
      (ws as unknown as { _logSend: typeof send })._logSend = send;
      void ensureTailer(serverId);
    },
    close(ws) {
      const serverId = ws.data.params.id;
      const send = (ws as unknown as { _logSend?: (l: string) => void })._logSend;
      if (send) logTailSubs.get(serverId)?.delete(send);
    },
  });
