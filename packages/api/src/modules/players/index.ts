import Elysia, { t } from "elysia";
import { authPlugin } from "../../plugins/rbac.ts";
import { db, schema } from "../../db/index.ts";
import { eq } from "drizzle-orm";
import { audit } from "../../lib/audit.ts";
import { sendCommand, invalidateStatus } from "../../lib/rcon.ts";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PlayerService } from "./service.ts";
import { ServerService } from "../servers/service.ts";

export const playersManagementRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  // Historical player list (unique names seen in logs)
  .get("/:id/players/history", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const [server] = await db
      .select({ logPath: schema.servers.logPath })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    if (!server) return status(404, "Server not found");
    if (!server.logPath) return { players: [] };

    const logsDir = path.dirname(server.logPath);
    const players = new Set<string>();
    const JOIN_RE = /\[Server thread\/INFO\]: (.+?) joined the game/;

    try {
      if (existsSync(server.logPath)) {
        for (const line of readFileSync(server.logPath, "utf8").split("\n")) {
          const m = JOIN_RE.exec(line);
          if (m?.[1]) players.add(m[1].trim());
        }
      }
    } catch { /* log file may not exist */ }

    try {
      if (existsSync(logsDir)) {
        for (const f of readdirSync(logsDir)) {
          if (!f.endsWith(".log") || f === "latest.log") continue;
          try {
            const lines = readFileSync(path.join(logsDir, f), "utf8").split("\n");
            for (const line of lines) {
              const m = JOIN_RE.exec(line);
              if (m?.[1]) players.add(m[1].trim());
            }
          } catch { /* archived log may not be readable */ }
        }
      }
    } catch { /* logs dir may not exist */ }

    return { players: [...players].sort((a, b) => a.localeCompare(b)) };
  })
  // Player details — stats, advancements, last seen, live RCON data
  .get("/:id/players/:name/details", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    if (!/^\w{1,16}$/.test(params.name)) return status(400, "Invalid player name");

    const [server] = await db
      .select({ logPath: schema.servers.logPath })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    if (!server) return status(404, "Server not found");

    const root = server.logPath ? (() => {
      try { return ServerService.deriveServerRoot(server.logPath!); } catch { return null; }
    })() : null;

    return PlayerService.getDetails(params.id, params.name, root);
  })
  // Live RCON data only (fast refresh, no file I/O)
  .get("/:id/players/:name/live", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    if (!/^\w{1,16}$/.test(params.name)) return status(400, "Invalid player name");
    return PlayerService.getLiveData(params.id, params.name);
  })
  // Kick a player (operator+)
  .post("/:id/players/:name/kick", async ({ params, body, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    if (session.user.role !== "admin" && session.user.role !== "operator") return status(403, "Forbidden");
    if (!/^\w{1,16}$/.test(params.name)) return status(400, "Invalid player name");
    const reason = ((body as { reason?: string }).reason ?? "Kicked by an admin")
      .replace(/[\r\n]/g, " ").slice(0, 200);
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
    if (session.user.role !== "admin") return status(403, "Forbidden");
    if (!/^\w{1,16}$/.test(params.name)) return status(400, "Invalid player name");
    const reason = ((body as { reason?: string }).reason ?? "Banned by an admin")
      .replace(/[\r\n]/g, " ").slice(0, 200);
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
  // Unban a player (admin only)
  .post("/:id/players/:name/unban", async ({ params, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    if (session.user.role !== "admin") return status(403, "Forbidden");
    if (!/^\w{1,16}$/.test(params.name)) return status(400, "Invalid player name");
    const response = await sendCommand(params.id, `pardon ${params.name}`);
    await audit({ userId: session.user.id, action: "player.unban", resource: "server", resourceId: params.id, metadata: { player: params.name }, ip: request.headers.get("x-forwarded-for") ?? undefined });
    return { response };
  })
  // Op a player (admin only)
  .post("/:id/players/:name/op", async ({ params, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    if (session.user.role !== "admin") return status(403, "Forbidden");
    if (!/^\w{1,16}$/.test(params.name)) return status(400, "Invalid player name");
    const response = await sendCommand(params.id, `op ${params.name}`);
    await audit({ userId: session.user.id, action: "player.op", resource: "server", resourceId: params.id, metadata: { player: params.name }, ip: request.headers.get("x-forwarded-for") ?? undefined });
    return { response };
  })
  // Deop a player (admin only)
  .post("/:id/players/:name/deop", async ({ params, session, status, request }) => {
    if (!session?.user) return status(401, "Unauthorized");
    if (session.user.role !== "admin") return status(403, "Forbidden");
    if (!/^\w{1,16}$/.test(params.name)) return status(400, "Invalid player name");
    const response = await sendCommand(params.id, `deop ${params.name}`);
    await audit({ userId: session.user.id, action: "player.deop", resource: "server", resourceId: params.id, metadata: { player: params.name }, ip: request.headers.get("x-forwarded-for") ?? undefined });
    return { response };
  });
