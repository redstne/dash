import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../plugins/rbac.ts";
import { db, schema } from "../db/index.ts";
import { eq } from "drizzle-orm";
import { encrypt } from "../lib/crypto.ts";
import { audit } from "../lib/audit.ts";
import { nanoid } from "nanoid";
import { getServerStatus, sendCommand, invalidateStatus } from "../lib/rcon.ts";
import net from "node:net";
import os from "node:os";
import dns from "node:dns/promises";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// ── server.properties helpers ─────────────────────────────────────────────────

/** Parse a server.properties file into a key-value map. */
function parseProperties(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    result[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return result;
}

/** Merge updated key-value pairs back into the original file content, preserving comments & order. */
function mergeProperties(content: string, updates: Record<string, string>): string {
  const lines = content.split("\n");
  const seen = new Set<string>();
  const result = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return line;
    const key = trimmed.slice(0, idx).trim();
    seen.add(key);
    if (key in updates) return `${key}=${updates[key]}`;
    return line;
  });
  // Append any new keys not already present
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) result.push(`${k}=${v}`);
  }
  return result.join("\n");
}

/** Derive server.properties path from a server's logPath (/data/mc/logs/latest.log → /data/mc/server.properties). */
function derivePropertiesPath(logPath: string | null): string | null {
  if (!logPath) return null;
  const parts = logPath.split("/");
  // Go up to the MC root (strip /logs/latest.log)
  const logsIdx = parts.lastIndexOf("logs");
  if (logsIdx === -1) return null;
  return [...parts.slice(0, logsIdx), "server.properties"].join("/");
}

/** Parse a .jar filename into name and version (e.g. "EssentialsX-2.20.1.jar" → { name: "EssentialsX", version: "2.20.1" }). */
function parseJarName(filename: string): { name: string; version: string } {
  const base = filename.replace(/\.jar$/i, "");
  const match = base.match(/^(.+?)[-_]v?(\d[\w.\-+]*)$/);
  if (match) return { name: match[1]!, version: match[2]! };
  return { name: base, version: "" };
}

/** Detect whether the server uses plugins/ or mods/ and return the dir. */
function derivePluginsDir(logPath: string | null): { type: "plugins" | "mods" | "none"; dir: string } {
  const propsPath = derivePropertiesPath(logPath);
  if (!propsPath) return { type: "none", dir: "" };
  const base = path.dirname(propsPath);
  const pluginsDir = path.join(base, "plugins");
  const modsDir = path.join(base, "mods");
  if (existsSync(pluginsDir)) return { type: "plugins", dir: pluginsDir };
  if (existsSync(modsDir)) return { type: "mods", dir: modsDir };
  return { type: "none", dir: "" };
}

// ── Network discovery helpers ────────────────────────────────────────────────

/** Returns base IPs of all non-loopback IPv4 interfaces (e.g. ["192.168.1", "172.17.0"]) */
function getLocalSubnetBases(): string[] {
  const bases = new Set<string>();
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const addr of ifaces ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        const parts = addr.address.split(".");
        bases.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }
  }
  return [...bases];
}

/** Returns all IPv4 addresses assigned to the local machine's own interfaces. */
function getOwnIps(): Set<string> {
  const ips = new Set<string>();
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const addr of ifaces ?? []) {
      if (addr.family === "IPv4") ips.add(addr.address);
    }
  }
  return ips;
}

/** Returns gateway IPs by parsing /proc/net/route (Linux). Silently returns empty set elsewhere. */
function getGatewayIps(): Set<string> {
  const gateways = new Set<string>();
  try {
    const lines = readFileSync("/proc/net/route", "utf8").trim().split("\n").slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const gw = parts[2];
      if (!gw || gw === "00000000") continue; // skip default/no-gateway rows
      // /proc/net/route stores IPs as little-endian hex
      const ip = [gw.slice(6, 8), gw.slice(4, 6), gw.slice(2, 4), gw.slice(0, 2)]
        .map((h) => parseInt(h, 16))
        .join(".");
      if (ip !== "0.0.0.0") gateways.add(ip);
    }
  } catch {
    // Non-Linux or permission denied — skip gracefully
  }
  return gateways;
}

/** Probe a single TCP host:port. Returns true if the port is open within timeout ms. */
function probePort(host: string, port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result: boolean) => { socket.destroy(); resolve(result); };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
    socket.connect(port, host);
  });
}

/** Scan a /24 subnet with up to `concurrency` parallel probes. */
async function scanSubnet(
  base: string,
  port: number,
  concurrency = 50,
): Promise<string[]> {
  const hosts = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);
  const found: string[] = [];

  for (let i = 0; i < hosts.length; i += concurrency) {
    const batch = hosts.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((h) => probePort(h, port).then((ok) => (ok ? h : null))));
    for (const h of results) if (h) found.push(h);
  }
  return found;
}


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
    const rconPort = Number(query.rconPort ?? 25575);
    const mcPort   = Number(query.mcPort   ?? 25565);

    const bases = getLocalSubnetBases();
    if (bases.length === 0) return { hosts: [] };

    // Scan in parallel across all detected subnets
    const allResults = await Promise.all([
      ...bases.map((b) => scanSubnet(b, rconPort)),
      ...bases.map((b) => scanSubnet(b, mcPort)),
    ]);

    // Deduplicate hosts — prefer RCON port
    const rconHosts = new Set(allResults.slice(0, bases.length).flat());
    const mcHosts   = new Set(allResults.slice(bases.length).flat());

    // Build exclusion sets: own IPs + gateway IPs should never appear as results
    const excluded = new Set([...getOwnIps(), ...getGatewayIps()]);

    const uniqueIps = [...new Set([...rconHosts, ...mcHosts])].filter((ip) => !excluded.has(ip));

    // Reverse DNS lookup for all IPs in parallel (best-effort)
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

      // Deduplicate by hostname: if two IPs reverse-resolve to the same PTR record,
      // keep only the first (RCON IPs come first so they're preferred)
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
  // Kick a player (operator+)
  .post("/:id/players/:name/kick", async ({ params, body, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const reason = (body as { reason?: string }).reason ?? "Kicked by an admin";
    const response = await sendCommand(params.id, `kick ${params.name} ${reason}`);
    invalidateStatus(params.id);
    await audit({
      userId: session.user.id,
      action: "player.kick",
      resource: "server",
      resourceId: params.id,
      metadata: { player: params.name, reason },
      ip: request.headers.get("x-forwarded-for") ?? undefined,
    });
    return { response };
  }, { body: t.Optional(t.Object({ reason: t.Optional(t.String()) })) })
  // Ban a player (admin only)
  .post("/:id/players/:name/ban", async ({ params, body, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    if (session.user.role !== "admin" && session.user.role !== "operator") return status(403, "Forbidden");
    const reason = (body as { reason?: string }).reason ?? "Banned by an admin";
    const response = await sendCommand(params.id, `ban ${params.name} ${reason}`);
    invalidateStatus(params.id);
    await audit({
      userId: session.user.id,
      action: "player.ban",
      resource: "server",
      resourceId: params.id,
      metadata: { player: params.name, reason },
      ip: request.headers.get("x-forwarded-for") ?? undefined,
    });
    return { response };
  }, { body: t.Optional(t.Object({ reason: t.Optional(t.String()) })) })
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
  // Send a lifecycle RCON command (operator+): reload, stop, restart
  .post("/:id/action/:cmd", async ({ params, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const { id, cmd } = params;
    if (cmd !== "reload" && cmd !== "stop" && cmd !== "restart") return status(400, "Invalid action");
    try {
      // "restart" = /stop and let the container restart policy bring it back up
      await sendCommand(id, cmd === "restart" ? "stop" : cmd);
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
  // Read server.properties (operator+)
  .get("/:id/properties", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const [server] = await db
      .select({ logPath: schema.servers.logPath })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    const propsPath = derivePropertiesPath(server?.logPath ?? null);
    if (!propsPath || !existsSync(propsPath)) return status(404, "server.properties not found");
    const content = readFileSync(propsPath, "utf8");
    return { properties: parseProperties(content) };
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
      const propsPath = derivePropertiesPath(server?.logPath ?? null);
      if (!propsPath || !existsSync(propsPath)) return status(404, "server.properties not found");

      const content = readFileSync(propsPath, "utf8");
      const updated = mergeProperties(content, body.properties as Record<string, string>);
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
  // List plugins or mods from filesystem (viewer+)
  .get("/:id/plugins", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const [server] = await db
      .select({ logPath: schema.servers.logPath })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    if (!server) return status(404, "Not found");
    const { type, dir } = derivePluginsDir(server.logPath ?? null);
    if (type === "none") return { type, items: [] };
    const files = readdirSync(dir).filter((f) => f.endsWith(".jar") && !f.startsWith("."));
    const items = files.map((filename) => {
      const stat = statSync(path.join(dir, filename));
      const parsed = parseJarName(filename);
      return { filename, name: parsed.name, version: parsed.version, size: stat.size, modifiedAt: stat.mtime.toISOString() };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return { type, items };
  })
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

