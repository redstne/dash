/**
 * Server logs API.
 * Lists all log files in the server's logs/ directory and serves their content.
 * Historical logs are .log.gz and are decompressed on the fly.
 * Content is always read-only.
 */

import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../plugins/rbac.ts";
import { readdir, stat } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { createGunzip } from "node:zlib";
import path from "node:path";
import { db, schema } from "../db/index.ts";
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
  .get("/:id/logs", async ({ params, set }) => {
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
