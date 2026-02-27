import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../plugins/rbac.ts";
import { rename, unlink, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { db, schema } from "../db/index.ts";
import { eq } from "drizzle-orm";
import { audit } from "../lib/audit.ts";

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;
const SAFE_FILENAME = /^[a-zA-Z0-9_\-.+ ]+\.jar(\.disabled)?$/;
const MODRINTH_CDN_PREFIXES = [
  "https://cdn.modrinth.com/",
  "https://cdn-raw.modrinth.com/",
];
const MODRINTH_API = "https://api.modrinth.com/v2";
const MODRINTH_UA = "redstnkit/dash (https://github.com/redstnkit/dash)";

function deriveServerRoot(logPath: string): string {
  const parts = logPath.split("/");
  const logsIdx = parts.lastIndexOf("logs");
  if (logsIdx === -1) throw new Error("Cannot derive server root from logPath");
  return parts.slice(0, logsIdx).join("/") || "/";
}

function deriveModsDir(logPath: string | null): { type: "plugins" | "mods" | "none"; dir: string } {
  if (!logPath) return { type: "none", dir: "" };
  const root = deriveServerRoot(logPath);
  const pluginsDir = path.join(root, "plugins");
  const modsDir = path.join(root, "mods");
  if (existsSync(pluginsDir)) return { type: "plugins", dir: pluginsDir };
  if (existsSync(modsDir)) return { type: "mods", dir: modsDir };
  return { type: "none", dir: "" };
}

function safeModPath(dir: string, filename: string): string {
  if (!SAFE_FILENAME.test(filename)) throw new Error("Invalid filename");
  const resolved = path.resolve(dir, filename);
  if (path.dirname(resolved) !== dir) throw new Error("Path traversal detected");
  return resolved;
}

async function getServerLogPath(serverId: string): Promise<string | null> {
  if (!SAFE_ID.test(serverId)) throw new Error("Invalid server ID");
  const [server] = await db
    .select({ logPath: schema.servers.logPath })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  return server?.logPath ?? null;
}

function parseJarName(filename: string): { name: string; version: string } {
  const base = filename.replace(/\.jar(\.disabled)?$/i, "");
  const match = base.match(/^(.+?)[-_]v?(\d[\w.\-+]*)$/);
  if (match) return { name: match[1]!, version: match[2]! };
  return { name: base, version: "" };
}

export const modsRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)

  // ── List mods/plugins (includes .jar.disabled) ────────────────────────
  .get("/:id/mods", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const logPath = await getServerLogPath(params.id);
    const { type, dir } = deriveModsDir(logPath);
    if (type === "none") return { type, items: [] };
    const files = await readdir(dir);
    const items = await Promise.all(
      files
        .filter((f) => (f.endsWith(".jar") || f.endsWith(".jar.disabled")) && !f.startsWith("."))
        .map(async (filename) => {
          const s = await stat(path.join(dir, filename));
          const parsed = parseJarName(filename);
          return {
            filename,
            name: parsed.name,
            version: parsed.version,
            enabled: filename.endsWith(".jar"),
            size: s.size,
            modifiedAt: s.mtime.toISOString(),
          };
        })
    );
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { type, items };
  })

  // ── Search Modrinth ───────────────────────────────────────────────────
  .get(
    "/:id/mods/search",
    async ({ params, query, session, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      // Validate server exists
      const logPath = await getServerLogPath(params.id);
      if (logPath === null && !SAFE_ID.test(params.id)) return status(404, "Server not found");
      const { q = "", loader, mcVersion } = query;
      const facets: string[][] = [["project_type:mod", "project_type:plugin"]];
      if (loader) facets.push([`categories:${loader}`]);
      if (mcVersion) facets.push([`versions:${mcVersion}`]);
      const qs = new URLSearchParams({ query: q, limit: "20", offset: "0", facets: JSON.stringify(facets) });
      const res = await fetch(`${MODRINTH_API}/search?${qs}`, {
        headers: { "User-Agent": MODRINTH_UA },
      });
      if (!res.ok) return status(502, "Modrinth search failed");
      return res.json();
    },
    { query: t.Object({ q: t.Optional(t.String()), loader: t.Optional(t.String()), mcVersion: t.Optional(t.String()) }) }
  )

  // ── List versions for a Modrinth project ──────────────────────────────
  .get(
    "/:id/mods/modrinth/:projectId/versions",
    async ({ params, query, session, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const { loader, mcVersion } = query;
      const qs = new URLSearchParams();
      if (loader) qs.set("loaders", JSON.stringify([loader]));
      if (mcVersion) qs.set("game_versions", JSON.stringify([mcVersion]));
      const res = await fetch(`${MODRINTH_API}/project/${params.projectId}/version?${qs}`, {
        headers: { "User-Agent": MODRINTH_UA },
      });
      if (!res.ok) return status(502, "Modrinth fetch failed");
      return res.json();
    },
    { query: t.Object({ loader: t.Optional(t.String()), mcVersion: t.Optional(t.String()) }) }
  )

  .use(requireRole("operator"))

  // ── Toggle enable / disable ───────────────────────────────────────────
  .post(
    "/:id/mods/:filename/toggle",
    async ({ params, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const logPath = await getServerLogPath(params.id);
      const { type, dir } = deriveModsDir(logPath);
      if (type === "none") return status(404, "Mods directory not found");
      let oldPath: string;
      try { oldPath = safeModPath(dir, params.filename); }
      catch { return status(400, "Invalid filename"); }
      let newFilename: string;
      let enabled: boolean;
      if (params.filename.endsWith(".jar.disabled")) {
        newFilename = params.filename.slice(0, -".disabled".length);
        enabled = true;
      } else if (params.filename.endsWith(".jar")) {
        newFilename = params.filename + ".disabled";
        enabled = false;
      } else {
        return status(400, "Not a JAR file");
      }
      const newPath = path.join(dir, newFilename);
      await rename(oldPath, newPath);
      await audit({
        userId: session.user.id,
        action: enabled ? "mod.enable" : "mod.disable",
        resource: "mod",
        resourceId: params.id,
        metadata: { filename: params.filename, newFilename },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { filename: newFilename, enabled };
    },
    { params: t.Object({ id: t.String(), filename: t.String() }) }
  )

  // ── Delete a mod ──────────────────────────────────────────────────────
  .delete(
    "/:id/mods/:filename",
    async ({ params, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const logPath = await getServerLogPath(params.id);
      const { type, dir } = deriveModsDir(logPath);
      if (type === "none") return status(404, "Mods directory not found");
      let filePath: string;
      try { filePath = safeModPath(dir, params.filename); }
      catch { return status(400, "Invalid filename"); }
      await unlink(filePath);
      await audit({
        userId: session.user.id,
        action: "mod.delete",
        resource: "mod",
        resourceId: params.id,
        metadata: { filename: params.filename },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true };
    },
    { params: t.Object({ id: t.String(), filename: t.String() }) }
  )

  // ── Install from Modrinth (download by URL + filename) ────────────────
  .post(
    "/:id/mods/install",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const { url, filename } = body;
      const trusted = MODRINTH_CDN_PREFIXES.some((p) => url.startsWith(p));
      if (!trusted) return status(400, "URL must be from Modrinth CDN");
      if (!SAFE_FILENAME.test(filename) || !filename.endsWith(".jar")) {
        return status(400, "Invalid filename");
      }
      const logPath = await getServerLogPath(params.id);
      const { type, dir } = deriveModsDir(logPath);
      if (type === "none") return status(404, "Mods directory not found");
      const dest = path.join(dir, filename);
      const res = await fetch(url);
      if (!res.ok) return status(502, "Download from Modrinth failed");
      await Bun.write(dest, res);
      await audit({
        userId: session.user.id,
        action: "mod.install",
        resource: "mod",
        resourceId: params.id,
        metadata: { filename, url },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true, filename };
    },
    { body: t.Object({ url: t.String(), filename: t.String() }) }
  );
