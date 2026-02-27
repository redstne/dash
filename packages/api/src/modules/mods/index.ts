import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../../plugins/rbac.ts";
import { rename, unlink, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { db, schema } from "../../db/index.ts";
import { eq, and } from "drizzle-orm";
import { audit } from "../../lib/audit.ts";
import { nanoid } from "nanoid";

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;
// Allow common chars in Modrinth filenames: alphanumeric, dash, dot, underscore, plus, brackets, parens, @, comma, space
const SAFE_FILENAME = /^[a-zA-Z0-9_\-.+[\]()@,% ]+\.jar(\.disabled)?$/;
// Trusted download sources (Modrinth, Hangar, SpigotMC, GitHub, BukkitDev, direct URLs we allow)
const TRUSTED_URL_PREFIXES = [
  "https://cdn.modrinth.com/",
  "https://cdn-raw.modrinth.com/",
  "https://hangar.papermc.io/",
  "https://github.com/",
  "https://dev.bukkit.org/",
  "https://api.spiget.org/",
];
// For "bukkit" (Paper/Spigot/Bukkit/Purpur servers), also include all compatible loader tags
const BUKKIT_LOADERS = ["bukkit", "paper", "spigot", "purpur", "folia"];
const MODRINTH_API = "https://api.modrinth.com/v2";
const MODRINTH_UA = "redstne/dash (https://github.com/redstne/dash)";

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

async function getServer(serverId: string): Promise<{ logPath: string | null } | null> {
  if (!SAFE_ID.test(serverId)) return null;
  const [server] = await db
    .select({ logPath: schema.servers.logPath })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  return server ?? null;
}

function parseJarName(filename: string): { name: string; version: string } {
  const base = filename.replace(/\.jar(\.disabled)?$/i, "");
  const match = base.match(/^(.+?)[-_]v?(\d[\w.\-+]*)$/);
  if (match) return { name: match[1]!, version: match[2]! };
  return { name: base, version: "" };
}

/** Write PLUGINS_FILE (itzg-compatible URL list) to server root */
async function regenerateManifest(serverId: string, serverRoot: string): Promise<void> {
  const plugins = await db
    .select({ downloadUrl: schema.serverPlugins.downloadUrl, name: schema.serverPlugins.name })
    .from(schema.serverPlugins)
    .where(eq(schema.serverPlugins.serverId, serverId));

  const lines = plugins
    .filter((p) => p.downloadUrl)
    .map((p) => `# ${p.name}\n${p.downloadUrl}`)
    .join("\n\n");

  const manifestPath = path.join(serverRoot, "redstne-plugins.txt");
  await writeFile(manifestPath, lines + "\n", "utf-8");
}

export const modsRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)

  // ── List mods/plugins (filesystem + DB metadata) ──────────────────────
  .get("/:id/mods", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const server = await getServer(params.id);
    if (!server) return status(404, "Server not found");
    const { type, dir } = deriveModsDir(server.logPath);
    if (type === "none") return { type, items: [] };

    // Get DB records for metadata enrichment
    const dbPlugins = await db
      .select()
      .from(schema.serverPlugins)
      .where(eq(schema.serverPlugins.serverId, params.id));
    const byFilename = new Map(dbPlugins.map((p) => [p.filename, p]));
    const byFilenameDisabled = new Map(dbPlugins.map((p) => [p.filename + ".disabled", p]));

    const files = await readdir(dir);
    const items = await Promise.all(
      files
        .filter((f) => (f.endsWith(".jar") || f.endsWith(".jar.disabled")) && !f.startsWith("."))
        .map(async (filename) => {
          const s = await stat(path.join(dir, filename));
          const parsed = parseJarName(filename);
          const dbRecord = byFilename.get(filename) ?? byFilenameDisabled.get(filename);
          return {
            filename,
            name: dbRecord?.name ?? parsed.name,
            version: dbRecord?.version ?? parsed.version,
            slug: dbRecord?.slug ?? null,
            source: dbRecord?.source ?? "filesystem",
            downloadUrl: dbRecord?.downloadUrl ?? null,
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
      const server = await getServer(params.id);
      if (!server) return status(404, "Server not found");
      const { q = "", loader, mcVersion } = query;
      const facets: string[][] = [["project_type:mod", "project_type:plugin"]];
      if (loader) {
        const loaders = loader === "bukkit" ? BUKKIT_LOADERS : [loader];
        facets.push(loaders.map((l) => `categories:${l}`));
      }
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
      if (loader) {
        const loaders = loader === "bukkit" ? BUKKIT_LOADERS : [loader];
        qs.set("loaders", JSON.stringify(loaders));
      }
      if (mcVersion) qs.set("game_versions", JSON.stringify([mcVersion]));
      const res = await fetch(`${MODRINTH_API}/project/${params.projectId}/version?${qs}`, {
        headers: { "User-Agent": MODRINTH_UA },
      });
      if (!res.ok) return status(502, "Modrinth fetch failed");
      return res.json();
    },
    { query: t.Object({ loader: t.Optional(t.String()), mcVersion: t.Optional(t.String()) }) }
  )

  // ── Get manifest (PLUGINS_FILE content) ───────────────────────────────
  .get("/:id/mods/manifest", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const plugins = await db
      .select()
      .from(schema.serverPlugins)
      .where(eq(schema.serverPlugins.serverId, params.id));
    return { plugins };
  })

  .use(requireRole("operator"))

  // ── Toggle enable / disable ───────────────────────────────────────────
  .post(
    "/:id/mods/:filename/toggle",
    async ({ params, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const server = await getServer(params.id);
      if (!server) return status(404, "Server not found");
      const { type, dir } = deriveModsDir(server.logPath);
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
      const server = await getServer(params.id);
      if (!server) return status(404, "Server not found");
      const { type, dir } = deriveModsDir(server.logPath);
      if (type === "none") return status(404, "Mods directory not found");
      let filePath: string;
      try { filePath = safeModPath(dir, params.filename); }
      catch { return status(400, "Invalid filename"); }
      await unlink(filePath);
      // Remove from DB by filename (either enabled or disabled)
      await db.delete(schema.serverPlugins).where(
        and(
          eq(schema.serverPlugins.serverId, params.id),
          eq(schema.serverPlugins.filename, params.filename.replace(/\.disabled$/, ""))
        )
      );
      // Regenerate manifest
      if (server.logPath) {
        try { await regenerateManifest(params.id, deriveServerRoot(server.logPath)); } catch { /* best effort */ }
      }
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

  // ── Install from Modrinth CDN ─────────────────────────────────────────
  .post(
    "/:id/mods/install",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const { url, filename, name, version, slug } = body;
      const trusted = TRUSTED_URL_PREFIXES.some((p) => url.startsWith(p));
      if (!trusted) return status(400, "URL must be from a trusted source (Modrinth, Hangar, GitHub, SpigotMC)");
      if (!SAFE_FILENAME.test(filename) || !filename.endsWith(".jar")) {
        return status(400, "Invalid filename");
      }
      const server = await getServer(params.id);
      if (!server) return status(404, "Server not found");
      const { type, dir } = deriveModsDir(server.logPath);
      if (type === "none") return status(404, "Mods directory not found");
      const dest = path.resolve(dir, filename);
      if (path.dirname(dest) !== dir) return status(400, "Invalid filename");
      const res = await fetch(url);
      if (!res.ok) return status(502, `Download failed (${res.status})`);
      await Bun.write(dest, res);
      // Upsert DB record
      const existing = await db.select({ id: schema.serverPlugins.id })
        .from(schema.serverPlugins)
        .where(and(eq(schema.serverPlugins.serverId, params.id), eq(schema.serverPlugins.filename, filename)))
        .limit(1);
      const source = url.includes("modrinth.com") ? "modrinth" : "url";
      if (existing.length > 0) {
        await db.update(schema.serverPlugins)
          .set({ downloadUrl: url, name: name ?? filename.replace(/\.jar$/, ""), version: version ?? null, slug: slug ?? null, source })
          .where(eq(schema.serverPlugins.id, existing[0]!.id));
      } else {
        await db.insert(schema.serverPlugins).values({
          id: nanoid(),
          serverId: params.id,
          name: name ?? filename.replace(/\.jar$/, ""),
          slug: slug ?? null,
          version: version ?? null,
          downloadUrl: url,
          filename,
          source,
        });
      }
      // Regenerate manifest for itzg PLUGINS_FILE
      if (server.logPath) {
        try { await regenerateManifest(params.id, deriveServerRoot(server.logPath)); } catch { /* best effort */ }
      }
      await audit({
        userId: session.user.id,
        action: "mod.install",
        resource: "mod",
        resourceId: params.id,
        metadata: { filename, url, source },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true, filename };
    },
    { body: t.Object({ url: t.String(), filename: t.String(), name: t.Optional(t.String()), version: t.Optional(t.String()), slug: t.Optional(t.String()) }) }
  )

  // ── Install from direct URL (any trusted or user-confirmed URL) ───────
  .post(
    "/:id/mods/install-url",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const { url, name } = body;
      if (!url.startsWith("https://")) return status(400, "URL must use HTTPS");
      const server = await getServer(params.id);
      if (!server) return status(404, "Server not found");
      const { type, dir } = deriveModsDir(server.logPath);
      if (type === "none") return status(404, "Mods directory not found");
      // Derive filename from URL
      const rawFilename = decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "");
      const filename = rawFilename.endsWith(".jar") ? rawFilename : (name ?? "plugin") + ".jar";
      if (!SAFE_FILENAME.test(filename)) return status(400, "Could not determine a safe filename from URL");
      const dest = path.resolve(dir, filename);
      if (path.dirname(dest) !== dir) return status(400, "Invalid filename");
      const res = await fetch(url, { headers: { "User-Agent": MODRINTH_UA } });
      if (!res.ok) return status(502, `Download failed (${res.status})`);
      await Bun.write(dest, res);
      // Record in DB
      const existing = await db.select({ id: schema.serverPlugins.id })
        .from(schema.serverPlugins)
        .where(and(eq(schema.serverPlugins.serverId, params.id), eq(schema.serverPlugins.filename, filename)))
        .limit(1);
      if (existing.length > 0) {
        await db.update(schema.serverPlugins).set({ downloadUrl: url, name: name ?? filename.replace(/\.jar$/, "") })
          .where(eq(schema.serverPlugins.id, existing[0]!.id));
      } else {
        await db.insert(schema.serverPlugins).values({
          id: nanoid(), serverId: params.id,
          name: name ?? filename.replace(/\.jar$/, ""),
          slug: null, version: null, downloadUrl: url, filename, source: "url",
        });
      }
      if (server.logPath) {
        try { await regenerateManifest(params.id, deriveServerRoot(server.logPath)); } catch { /* best effort */ }
      }
      await audit({
        userId: session.user.id, action: "mod.install", resource: "mod", resourceId: params.id,
        metadata: { filename, url, source: "url" },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true, filename };
    },
    { body: t.Object({ url: t.String(), name: t.Optional(t.String()) }) }
  );

