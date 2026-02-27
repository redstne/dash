import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../../plugins/rbac.ts";
import { db, schema } from "../../db/index.ts";
import { eq } from "drizzle-orm";
import { readdirSync, existsSync, statSync, renameSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { audit } from "../../lib/audit.ts";
import { ServerService } from "../servers/service.ts";

async function getServerRoot(serverId: string): Promise<string | null> {
  const [server] = await db
    .select({ logPath: schema.servers.logPath })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (!server?.logPath) return null;
  try { return ServerService.deriveServerRoot(server.logPath); } catch { return null; }
}

function getActiveLevelName(serverRoot: string): string | null {
  const propsPath = join(serverRoot, "server.properties");
  if (!existsSync(propsPath)) return null;
  try {
    const content = readFileSync(propsPath, "utf8");
    const match = content.match(/^level-name=(.+)$/m);
    return match?.[1]?.trim() ?? null;
  } catch { return null; }
}

function getDirSizeBytes(dir: string): number {
  let total = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) total += getDirSizeBytes(full);
      else try { total += statSync(full).size; } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return total;
}

export const worldsRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)

  // List world directories (containing level.dat)
  .get("/:id/worlds", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const serverRoot = await getServerRoot(params.id);
    if (!serverRoot) return status(404, "Server not configured");
    const activeName = getActiveLevelName(serverRoot);
    const worlds: { name: string; sizeBytes: number; lastModified: string; isActive: boolean }[] = [];
    try {
      for (const entry of readdirSync(serverRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const worldDir = join(serverRoot, entry.name);
        if (!existsSync(join(worldDir, "level.dat"))) continue;
        const st = statSync(worldDir);
        worlds.push({
          name: entry.name,
          sizeBytes: getDirSizeBytes(worldDir),
          lastModified: st.mtime.toISOString(),
          isActive: entry.name === activeName,
        });
      }
    } catch { /* dir not accessible */ }
    return worlds;
  })

  .use(requireRole("operator"))

  // Reset a world (rename to .bak.TIMESTAMP, recreate empty dir)
  .post("/:id/worlds/:name/reset", async ({ params, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const serverRoot = await getServerRoot(params.id);
    if (!serverRoot) return status(404, "Server not configured");
    const worldDir = join(serverRoot, params.name);
    if (!existsSync(worldDir) || !existsSync(join(worldDir, "level.dat"))) {
      return status(404, "World not found");
    }
    const backupName = `${worldDir}.bak.${Date.now()}`;
    renameSync(worldDir, backupName);
    mkdirSync(worldDir);
    await audit({
      userId: session.user.id,
      action: "world.reset",
      resource: "server",
      resourceId: params.id,
      metadata: { world: params.name, backup: backupName },
      ip: request.headers.get("x-forwarded-for") ?? undefined,
    });
    return { ok: true, backup: backupName };
  })

  // Download world as tar.gz stream
  .get("/:id/worlds/:name/download", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const serverRoot = await getServerRoot(params.id);
    if (!serverRoot) return status(404, "Server not configured");
    const worldDir = join(serverRoot, params.name);
    if (!existsSync(worldDir) || !existsSync(join(worldDir, "level.dat"))) {
      return status(404, "World not found");
    }
    const proc = Bun.spawn(["tar", "-czf", "-", params.name], {
      cwd: serverRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    return new Response(proc.stdout as ReadableStream, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${params.name}.tar.gz"`,
      },
    });
  })

  // Upload world (.zip or .tar.gz), extract to server root
  .post(
    "/:id/worlds/upload",
    async ({ params, session, status, body, request }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const serverRoot = await getServerRoot(params.id);
      if (!serverRoot) return status(404, "Server not configured");

      const file = body.file as File;
      const filename = file.name ?? "world.tar.gz";
      const buffer = Buffer.from(await file.arrayBuffer());

      // Write to temp file
      const tmpPath = join(serverRoot, `.upload_${Date.now()}_${filename}`);
      await Bun.write(tmpPath, buffer);

      try {
        if (filename.endsWith(".zip")) {
          const proc = Bun.spawnSync(["unzip", "-o", tmpPath, "-d", serverRoot], { cwd: serverRoot });
          if (proc.exitCode !== 0) return status(500, "Failed to extract zip");
        } else if (filename.endsWith(".tar.gz") || filename.endsWith(".tgz")) {
          const proc = Bun.spawnSync(["tar", "-xzf", tmpPath, "-C", serverRoot], { cwd: serverRoot });
          if (proc.exitCode !== 0) return status(500, "Failed to extract tar.gz");
        } else {
          return status(400, "Unsupported format: use .zip or .tar.gz");
        }
      } finally {
        try { Bun.spawnSync(["rm", "-f", tmpPath]); } catch { /* ignore */ }
      }

      await audit({
        userId: session.user.id,
        action: "world.upload",
        resource: "server",
        resourceId: params.id,
        metadata: { filename },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { ok: true };
    },
    {
      body: t.Object({ file: t.File() }),
      type: "formdata",
    }
  );
