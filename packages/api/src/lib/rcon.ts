import { Rcon } from "rcon-client";
import { db, schema } from "../db/index.ts";
import { eq } from "drizzle-orm";
import { decrypt } from "./crypto.ts";

interface RconConnection {
  client: Rcon;
  serverId: string;
  lastUsed: number;
}

const pool = new Map<string, RconConnection>();

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

// Prune idle connections every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, conn] of pool) {
    if (now - conn.lastUsed > IDLE_TIMEOUT_MS) {
      conn.client.end().catch(() => {});
      pool.delete(id);
    }
  }
}, 60_000);

export async function getRcon(serverId: string): Promise<Rcon> {
  const existing = pool.get(serverId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.client;
  }

  const [server] = await db
    .select()
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);

  if (!server) throw new Error(`Server ${serverId} not found`);

  const password = await decrypt(server.rconPasswordEncrypted);

  const rcon = new Rcon({
    host: server.host,
    port: server.rconPort,
    password,
    timeout: 5000,
  });

  await rcon.connect();

  rcon.on("end", () => pool.delete(serverId));
  rcon.on("error", () => {
    pool.delete(serverId);
  });

  pool.set(serverId, { client: rcon, serverId, lastUsed: Date.now() });
  return rcon;
}

export async function sendCommand(serverId: string, command: string): Promise<string> {
  try {
    const rcon = await getRcon(serverId);
    return await rcon.send(command);
  } catch (e) {
    // If the pooled connection was stale, evict it and retry once with a fresh connection
    if (pool.has(serverId)) {
      pool.get(serverId)?.client.end().catch(() => {});
      pool.delete(serverId);
      const rcon = await getRcon(serverId);
      return rcon.send(command);
    }
    throw e;
  }
}

export async function getOnlinePlayers(serverId: string): Promise<string[]> {
  const response = await sendCommand(serverId, "list");
  // "There are X of a max of Y players online: name1, name2"
  const match = response.match(/players online:(.*)/i);
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface ServerStatus {
  online: boolean;
  players: string[];
  playerCount: number;
  maxPlayers: number;
  tps: number | null;
}

import { recordSample } from "./analytics.ts";

// Cache status per server to avoid hammering RCON
const statusCache = new Map<string, { status: ServerStatus; at: number }>();
const STATUS_TTL_MS = 5_000;

export async function getServerStatus(serverId: string): Promise<ServerStatus> {
  const cached = statusCache.get(serverId);
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.status;

  try {
    const listResponse = await sendCommand(serverId, "list");
    // "There are X of a max of Y players online: ..."
    const listMatch = listResponse.match(/There are (\d+) of a max(?: of)? (\d+) players online:(.*)/i);
    const playerCount = listMatch ? parseInt(listMatch[1]!) : 0;
    const maxPlayers  = listMatch ? parseInt(listMatch[2]!) : 20;
    const players     = listMatch?.[3]
      ? listMatch[3].split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // TPS — only available on Paper/Spigot, silently skip on vanilla
    let tps: number | null = null;
    try {
      const tpsResponse = await sendCommand(serverId, "tps");
      // Strip §x Minecraft color codes before parsing (e.g. §6TPS ... §a19.97)
      const cleaned = tpsResponse.replace(/§./g, "");
      // Match first TPS value after the colon: "TPS from last 1m, 5m, 15m: 19.97, ..."
      const tpsMatch = cleaned.match(/:\s*(\d+\.?\d*)/);
      if (tpsMatch) tps = Math.min(20, parseFloat(tpsMatch[1]!));
    } catch { /* vanilla — ignore */ }

    const status: ServerStatus = { online: true, players, playerCount, maxPlayers, tps };
    statusCache.set(serverId, { status, at: Date.now() });
    recordSample(serverId, tps, playerCount);
    return status;
  } catch {
    const status: ServerStatus = { online: false, players: [], playerCount: 0, maxPlayers: 0, tps: null };
    statusCache.set(serverId, { status, at: Date.now() });
    recordSample(serverId, null, 0);
    return status;
  }
}

/** Invalidate cached status (call after known state change) */
export function invalidateStatus(serverId: string) {
  statusCache.delete(serverId);
}
