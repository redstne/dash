import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../plugins/rbac.ts";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { db, schema } from "../db/index.ts";
import { eq } from "drizzle-orm";
import { audit } from "../lib/audit.ts";

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

// Trusted download domains per runtime
const TRUSTED_DOWNLOAD_ORIGINS = [
  "https://api.papermc.io/",
  "https://api.purpurmc.org/",
  "https://meta.fabricmc.net/",
  "https://maven.minecraftforge.net/",
  "https://piston-data.mojang.com/",
  "https://launcher.mojang.com/",
];

export type RuntimeType = "vanilla" | "paper" | "purpur" | "fabric" | "forge";

/** Patterns to detect the running server JAR in the server root directory. */
const RUNTIME_PATTERNS: Array<{ runtime: RuntimeType; pattern: RegExp }> = [
  { runtime: "paper",   pattern: /^paper[-_].+\.jar$/i },
  { runtime: "purpur",  pattern: /^purpur[-_].+\.jar$/i },
  { runtime: "fabric",  pattern: /^fabric[-_server].+\.jar$/i },
  { runtime: "forge",   pattern: /^forge[-_].+\.jar$/i },
  { runtime: "vanilla", pattern: /^minecraft_server\..+\.jar$/i },
];

function deriveServerRoot(logPath: string): string {
  const parts = logPath.split("/");
  const logsIdx = parts.lastIndexOf("logs");
  if (logsIdx === -1) throw new Error("Cannot derive server root from logPath");
  return parts.slice(0, logsIdx).join("/") || "/";
}

async function getServer(serverId: string) {
  if (!SAFE_ID.test(serverId)) throw new Error("Invalid server ID");
  const [server] = await db
    .select({ logPath: schema.servers.logPath })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  return server ?? null;
}

// ── Upstream API helpers ──────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`Upstream request failed: ${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function getVanillaMcVersions(): Promise<string[]> {
  const manifest = await fetchJson<{ versions: Array<{ id: string; type: string }> }>(
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"
  );
  return manifest.versions.filter((v) => v.type === "release").map((v) => v.id);
}

async function getVanillaDownloadUrl(mcVersion: string): Promise<{ url: string; filename: string }> {
  const manifest = await fetchJson<{ versions: Array<{ id: string; url: string }> }>(
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"
  );
  const entry = manifest.versions.find((v) => v.id === mcVersion);
  if (!entry) throw new Error(`Vanilla version not found: ${mcVersion}`);
  const versionMeta = await fetchJson<{ downloads: { server: { url: string } } }>(entry.url);
  return { url: versionMeta.downloads.server.url, filename: `minecraft_server.${mcVersion}.jar` };
}

async function getPaperMcVersions(): Promise<string[]> {
  const data = await fetchJson<{ versions: string[] }>("https://api.papermc.io/v2/projects/paper");
  return [...data.versions].reverse();
}

async function getPaperBuilds(mcVersion: string): Promise<Array<{ id: number; stable: boolean }>> {
  const data = await fetchJson<{ builds: number[] }>(
    `https://api.papermc.io/v2/projects/paper/versions/${encodeURIComponent(mcVersion)}`
  );
  return [...data.builds].reverse().map((b, i) => ({ id: b, stable: i === 0 }));
}

async function getPurpurMcVersions(): Promise<string[]> {
  const data = await fetchJson<{ versions: string[] }>("https://api.purpurmc.org/v2/purpur");
  return [...data.versions].reverse();
}

async function getPurpurBuilds(mcVersion: string): Promise<Array<{ id: string; stable: boolean }>> {
  const data = await fetchJson<{ builds: { all: string[]; latest: string } }>(
    `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(mcVersion)}`
  );
  return data.builds.all.reverse().map((b) => ({ id: b, stable: b === data.builds.latest }));
}

async function getFabricMcVersions(): Promise<string[]> {
  const data = await fetchJson<Array<{ version: string; stable: boolean }>>(
    "https://meta.fabricmc.net/v2/versions/game"
  );
  return data.filter((v) => v.stable).map((v) => v.version);
}

async function getFabricLoaders(mcVersion: string): Promise<{ loaders: string[]; installers: string[] }> {
  const [loaders, installers] = await Promise.all([
    fetchJson<Array<{ loader: { version: string }; stable: boolean }>>(
      `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`
    ),
    fetchJson<Array<{ version: string; stable: boolean }>>("https://meta.fabricmc.net/v2/versions/installer"),
  ]);
  return {
    loaders: loaders.filter((l) => l.stable).map((l) => l.loader.version),
    installers: installers.filter((i) => i.stable).map((i) => i.version),
  };
}

async function getForgeMcVersions(): Promise<string[]> {
  const res = await fetch(
    "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml"
  );
  if (!res.ok) throw new Error("Forge maven metadata fetch failed");
  const xml = await res.text();
  const matches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)];
  const versions = matches.map((m) => m[1]!);
  // Extract unique MC versions (format: mcVersion-forgeVersion)
  const mcVersions = [...new Set(versions.map((v) => v.split("-")[0]!))];
  return mcVersions.reverse();
}

async function getForgeBuilds(mcVersion: string): Promise<Array<{ id: string; stable: boolean }>> {
  const res = await fetch(
    "https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml"
  );
  if (!res.ok) throw new Error("Forge maven metadata fetch failed");
  const xml = await res.text();
  const matches = [...xml.matchAll(/<version>([^<]+)<\/version>/g)];
  const builds = matches
    .map((m) => m[1]!)
    .filter((v) => v.startsWith(`${mcVersion}-`))
    .reverse();
  return builds.map((v, i) => ({ id: v, stable: i === 0 }));
}

// ── Route ─────────────────────────────────────────────────────────────────

export const runtimeRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)

  // ── Detect current server JAR ─────────────────────────────────────────
  .get("/:id/runtime/current", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const server = await getServer(params.id);
    if (!server) return status(404, "Server not found");
    if (!server.logPath) return { filename: null, runtime: null, version: null };
    const root = deriveServerRoot(server.logPath);
    let files: string[];
    try { files = await readdir(root); }
    catch { return { filename: null, runtime: null, version: null }; }
    const jars = files.filter((f) => f.endsWith(".jar"));
    for (const jar of jars) {
      for (const { runtime, pattern } of RUNTIME_PATTERNS) {
        if (pattern.test(jar)) {
          const versionMatch = jar.match(/(\d+\.\d+[\w.]*)/);
          return { filename: jar, runtime, version: versionMatch?.[1] ?? null };
        }
      }
    }
    // Generic server.jar fallback
    if (jars.includes("server.jar")) return { filename: "server.jar", runtime: "unknown", version: null };
    return { filename: jars[0] ?? null, runtime: "unknown" as const, version: null };
  })

  // ── List available versions from upstream ─────────────────────────────
  .get(
    "/:id/runtime/versions",
    async ({ params, query, session, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const { runtime, mcVersion } = query;
      try {
        if (!mcVersion) {
          // Return list of MC versions for this runtime
          switch (runtime) {
            case "vanilla": return { mcVersions: await getVanillaMcVersions() };
            case "paper":   return { mcVersions: await getPaperMcVersions() };
            case "purpur":  return { mcVersions: await getPurpurMcVersions() };
            case "fabric":  return { mcVersions: await getFabricMcVersions() };
            case "forge":   return { mcVersions: await getForgeMcVersions() };
          }
        } else {
          // Return builds/loaders for the selected MC version
          switch (runtime) {
            case "vanilla": {
              const dl = await getVanillaDownloadUrl(mcVersion);
              return { builds: [{ id: mcVersion, stable: true, downloadUrl: dl.url, filename: dl.filename }] };
            }
            case "paper":   return { builds: await getPaperBuilds(mcVersion) };
            case "purpur":  return { builds: await getPurpurBuilds(mcVersion) };
            case "fabric":  return await getFabricLoaders(mcVersion);
            case "forge":   return { builds: await getForgeBuilds(mcVersion) };
          }
        }
      } catch (e) {
        return status(502, `Upstream API error: ${(e as Error).message}`);
      }
    },
    {
      query: t.Object({
        runtime: t.Union([
          t.Literal("vanilla"),
          t.Literal("paper"),
          t.Literal("purpur"),
          t.Literal("fabric"),
          t.Literal("forge"),
        ]),
        mcVersion: t.Optional(t.String()),
      }),
    }
  )

  .use(requireRole("admin"))

  // ── Download and install a server JAR ────────────────────────────────
  .post(
    "/:id/runtime/install",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const { url, filename, runtime, mcVersion } = body;
      // Validate URL is from a trusted origin
      const trusted = TRUSTED_DOWNLOAD_ORIGINS.some((o) => url.startsWith(o));
      if (!trusted) return status(400, "URL is not from a trusted runtime source");
      if (!/^[a-zA-Z0-9_\-.]+\.jar$/.test(filename)) return status(400, "Invalid filename");
      const server = await getServer(params.id);
      if (!server) return status(404, "Server not found");
      if (!server.logPath) return status(400, "Server has no logPath configured");
      const root = deriveServerRoot(server.logPath);
      const dest = path.join(root, filename);
      // Ensure destination is within server root
      if (!dest.startsWith(root + path.sep) && dest !== root) {
        return status(400, "Invalid destination path");
      }
      const res = await fetch(url, { headers: { "Accept": "application/octet-stream" } });
      if (!res.ok) return status(502, `Download failed: ${res.status}`);
      await Bun.write(dest, res);
      await audit({
        userId: session.user.id,
        action: "runtime.install",
        resource: "server",
        resourceId: params.id,
        metadata: { runtime, mcVersion, filename, url },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true, filename, path: dest };
    },
    {
      body: t.Object({
        url: t.String(),
        filename: t.String(),
        runtime: t.String(),
        mcVersion: t.String(),
      }),
    }
  );
