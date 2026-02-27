import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../../plugins/rbac.ts";
import { db, schema } from "../../db/index.ts";
import { eq, desc, isNull, and } from "drizzle-orm";
import { encrypt } from "../../lib/crypto.ts";
import { audit } from "../../lib/audit.ts";
import { nanoid } from "nanoid";
import { getServerStatus, sendCommand, invalidateStatus } from "../../lib/rcon.ts";
import { startContainer } from "../../lib/docker.ts";
import dns from "node:dns/promises";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ServerService } from "./service.ts";

export const serversRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  // List all servers (any authenticated user)
  .get("/", ({ session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    return db
      .select({
        id: schema.servers.id,
        name: schema.servers.name,
        host: schema.servers.host,
        rconPort: schema.servers.rconPort,
        dockerContainerId: schema.servers.dockerContainerId,
        dynmapUrl: schema.servers.dynmapUrl,
        enabled: schema.servers.enabled,
        createdAt: schema.servers.createdAt,
      })
      .from(schema.servers);
  })
  // Get single server details (any authenticated user)
  .get("/:id", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const [server] = await db
      .select({
        id: schema.servers.id,
        name: schema.servers.name,
        host: schema.servers.host,
        rconPort: schema.servers.rconPort,
        dynmapUrl: schema.servers.dynmapUrl,
        logPath: schema.servers.logPath,
        enabled: schema.servers.enabled,
        createdAt: schema.servers.createdAt,
      })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    if (!server) return status(404, "Not found");
    return server;
  })
  // Discover Minecraft servers on local network subnets (admin only)
  .get("/discover", async ({ session, status, query }) => {
    if (!session?.user) return status(401, "Unauthorized");
    if (session.user.role !== "admin") return status(403, "Forbidden");
    const rconPort = Number(query.rconPort ?? 25575);
    const mcPort   = Number(query.mcPort   ?? 25565);

    const bases = ServerService.getLocalSubnetBases();
    if (bases.length === 0) return { hosts: [] };

    const allResults = await Promise.all([
      ...bases.map((b) => ServerService.scanSubnet(b, rconPort)),
      ...bases.map((b) => ServerService.scanSubnet(b, mcPort)),
    ]);

    const rconHosts = new Set(allResults.slice(0, bases.length).flat());
    const mcHosts   = new Set(allResults.slice(bases.length).flat());

    const excluded = new Set([...ServerService.getOwnIps(), ...ServerService.getGatewayIps()]);
    const uniqueIps = [...new Set([...rconHosts, ...mcHosts])].filter((ip) => !excluded.has(ip));

    const hostnames = await Promise.all(
      uniqueIps.map((ip) =>
        dns.reverse(ip)
          .then((names) => names[0] ?? null)
          .catch(() => null)
      )
    );

    const hosts: { host: string; hostname: string | null; rconPort: number; hasRcon: boolean; hasMinecraft: boolean }[] = [];
    const seenHostnames = new Set<string>();

    for (let i = 0; i < uniqueIps.length; i++) {
      const ip = uniqueIps[i]!;
      const hostname = hostnames[i] ?? null;

      if (hostname && seenHostnames.has(hostname)) continue;
      if (hostname) seenHostnames.add(hostname);

      hosts.push({
        host: ip,
        hostname,
        rconPort,
        hasRcon: rconHosts.has(ip),
        hasMinecraft: mcHosts.has(ip),
      });
    }

    return { hosts, scannedSubnets: bases };
  }, {
    query: t.Optional(t.Object({
      rconPort: t.Optional(t.String()),
      mcPort: t.Optional(t.String()),
    })),
  })
  // Real-time server status (online, players, TPS) via RCON
  .get("/:id/status", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    return getServerStatus(params.id);
  })
  // Read server.properties (operator+)
  .get("/:id/properties", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const [server] = await db
      .select({ logPath: schema.servers.logPath })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    const propsPath = ServerService.derivePropertiesPath(server?.logPath ?? null);
    if (!propsPath || !existsSync(propsPath)) return status(404, "server.properties not found");
    const content = readFileSync(propsPath, "utf8");
    return { properties: ServerService.parseProperties(content) };
  })
  // List plugins or mods from filesystem (viewer+)
  .get("/:id/plugins", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const [server] = await db
      .select({ logPath: schema.servers.logPath })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    if (!server) return status(404, "Not found");
    const { type, dir } = ServerService.derivePluginsDir(server.logPath ?? null);
    if (type === "none") return { type, items: [] };
    const files = readdirSync(dir).filter((f) => f.endsWith(".jar") && !f.startsWith("."));
    const items = files.map((filename) => {
      const s = statSync(path.join(dir, filename));
      const parsed = ServerService.parseJarName(filename);
      return { filename, name: parsed.name, version: parsed.version, size: s.size, modifiedAt: s.mtime.toISOString() };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { type, items };
  })
  // Get server icon (public image)
  .get("/:id/icon", async ({ params, status }) => {
    const [server] = await db
      .select({ logPath: schema.servers.logPath })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    if (!server?.logPath) return status(404, "Not found");
    let serverRoot: string;
    try { serverRoot = ServerService.deriveServerRoot(server.logPath); } catch { return status(404, "Not found"); }
    const iconPath = path.join(serverRoot, "server-icon.png");
    if (!existsSync(iconPath)) return status(404, "No icon");
    const file = Bun.file(iconPath);
    return new Response(file, { headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" } });
  })
  // Upload server icon (operator+)
  .post("/:id/icon", async ({ params, session, role, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    if (!role || ["viewer"].includes(role)) return status(403, "Forbidden");
    const [server] = await db
      .select({ logPath: schema.servers.logPath })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    if (!server?.logPath) return status(404, "Not found");
    let serverRoot: string;
    try { serverRoot = ServerService.deriveServerRoot(server.logPath); } catch { return status(404, "Not found"); }
    const body = await request.arrayBuffer();
    if (body.byteLength > 1024 * 1024) return status(413, "File too large (max 1 MB)");
    const iconPath = path.join(serverRoot, "server-icon.png");
    writeFileSync(iconPath, Buffer.from(body));
    await audit({
      userId: session.user.id,
      action: "server.icon_update",
      resource: "server",
      resourceId: params.id,
      ip: request.headers.get("x-forwarded-for") ?? undefined,
    });
    return { ok: true };
  })
  // Player session history
  .get("/:id/players/sessions", async ({ params, session, status, query }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const limit = Math.min(Number(query?.limit ?? 100), 500);
    const sessions = await db
      .select()
      .from(schema.playerSessions)
      .where(eq(schema.playerSessions.serverId, params.id))
      .orderBy(desc(schema.playerSessions.joinedAt))
      .limit(limit);
    return sessions.map((s) => ({
      ...s,
      durationSeconds: s.leftAt && s.joinedAt
        ? Math.floor((s.leftAt.getTime() - s.joinedAt.getTime()) / 1000)
        : null,
    }));
  }, {
    query: t.Optional(t.Object({ limit: t.Optional(t.String()) })),
  })
  // Create a server (admin only)
  .use(requireRole("admin"))
  .post(
    "/",
    async ({ body, session, status, request }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const rconPasswordEncrypted = await encrypt(body.rconPassword);
      const id = nanoid();
      await db.insert(schema.servers).values({
        id,
        name: body.name,
        host: body.host,
        rconPort: body.rconPort,
        rconPasswordEncrypted,
        dockerContainerId: body.dockerContainerId,
        dynmapUrl: body.dynmapUrl,
      });
      await audit({
        userId: session.user.id,
        action: "create",
        resource: "server",
        resourceId: id,
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { id };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 64 }),
        host: t.String({ minLength: 1 }),
        rconPort: t.Number({ minimum: 1, maximum: 65535 }),
        rconPassword: t.String({ minLength: 1 }),
        dockerContainerId: t.Optional(t.String()),
        dynmapUrl: t.Optional(t.String()),
      }),
    }
  )
  // Update a server (admin only)
  .patch(
    "/:id",
    async ({ params, body, session, status, request }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const updates: Partial<typeof schema.servers.$inferInsert> = {};
      if (body.name) updates.name = body.name;
      if (body.host) updates.host = body.host;
      if (body.rconPort) updates.rconPort = body.rconPort;
      if (body.rconPassword) updates.rconPasswordEncrypted = await encrypt(body.rconPassword);
      if (body.dockerContainerId !== undefined) updates.dockerContainerId = body.dockerContainerId;
      if (body.dynmapUrl !== undefined) updates.dynmapUrl = body.dynmapUrl;
      if (body.logPath !== undefined) updates.logPath = body.logPath;
      if (body.enabled !== undefined) updates.enabled = body.enabled;

      await db.update(schema.servers).set(updates).where(eq(schema.servers.id, params.id));
      await audit({
        userId: session.user.id,
        action: "update",
        resource: "server",
        resourceId: params.id,
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { ok: true };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
        host: t.Optional(t.String()),
        rconPort: t.Optional(t.Number({ minimum: 1, maximum: 65535 })),
        rconPassword: t.Optional(t.String()),
        dockerContainerId: t.Optional(t.Nullable(t.String())),
        dynmapUrl: t.Optional(t.Nullable(t.String())),
        logPath: t.Optional(t.Nullable(t.String())),
        enabled: t.Optional(t.Boolean()),
      }),
    }
  )
  // Send a lifecycle command (operator+): start, stop, restart, reload
  .post("/:id/action/:cmd", async ({ params, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const { id, cmd } = params;
    if (!["start", "reload", "stop", "restart"].includes(cmd)) return status(400, "Invalid action");

    const [server] = await db
      .select({ dockerContainerId: schema.servers.dockerContainerId })
      .from(schema.servers)
      .where(eq(schema.servers.id, id))
      .limit(1);
    if (!server) return status(404, "Not found");

    try {
      if (cmd === "start") {
        if (!server.dockerContainerId) return status(422, "No Docker container linked to this server");
        await startContainer(server.dockerContainerId);
      } else {
        await sendCommand(id, cmd === "restart" ? "stop" : cmd);
      }
      invalidateStatus(id);
      await audit({
        userId: session.user.id,
        action: `server.${cmd}`,
        resource: "server",
        resourceId: id,
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { ok: true };
    } catch (e) {
      return status(502, String(e));
    }
  })
  // Write specific server.properties keys (admin only)
  .patch(
    "/:id/properties",
    async ({ params, body, session, status, request }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const [server] = await db
        .select({ logPath: schema.servers.logPath })
        .from(schema.servers)
        .where(eq(schema.servers.id, params.id))
        .limit(1);
      const propsPath = ServerService.derivePropertiesPath(server?.logPath ?? null);
      if (!propsPath || !existsSync(propsPath)) return status(404, "server.properties not found");

      const content = readFileSync(propsPath, "utf8");
      const updated = ServerService.mergeProperties(content, body.properties as Record<string, string>);
      writeFileSync(propsPath, updated, "utf8");

      await audit({
        userId: session.user.id,
        action: "server.properties.update",
        resource: "server",
        resourceId: params.id,
        metadata: { keys: Object.keys(body.properties) },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { ok: true };
    },
    {
      body: t.Object({
        properties: t.Record(t.String(), t.String()),
      }),
    }
  )
  // Delete a server (admin only)
  .delete("/:id", async ({ params, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    await db.delete(schema.servers).where(eq(schema.servers.id, params.id));
    await audit({
      userId: session.user.id,
      action: "delete",
      resource: "server",
      resourceId: params.id,
      ip: request.headers.get("x-forwarded-for") ?? undefined,
    });
    return { ok: true };
  });
