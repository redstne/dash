import Elysia from "elysia";
import { authPlugin, requireRole } from "../../plugins/rbac.ts";
import { sendCommand, getOnlinePlayers, getServerStatus } from "../../lib/rcon.ts";
import { audit } from "../../lib/audit.ts";
import { db, schema } from "../../db/index.ts";
import { eq } from "drizzle-orm";
import fs from "node:fs";

// ── Minecraft § color codes → ANSI escape codes ───────────────────────────
const MC_ANSI: Record<string, string> = {
  "0": "\x1b[30m",   // black
  "1": "\x1b[34m",   // dark blue
  "2": "\x1b[32m",   // dark green
  "3": "\x1b[36m",   // dark aqua
  "4": "\x1b[31m",   // dark red
  "5": "\x1b[35m",   // dark purple
  "6": "\x1b[33m",   // gold
  "7": "\x1b[37m",   // gray
  "8": "\x1b[90m",   // dark gray
  "9": "\x1b[94m",   // blue
  a:   "\x1b[92m",   // green
  b:   "\x1b[96m",   // aqua
  c:   "\x1b[91m",   // red
  d:   "\x1b[95m",   // light purple
  e:   "\x1b[93m",   // yellow
  f:   "\x1b[97m",   // white
  k:   "",           // obfuscated — skip
  l:   "\x1b[1m",    // bold
  m:   "\x1b[9m",    // strikethrough
  n:   "\x1b[4m",    // underline
  o:   "\x1b[3m",    // italic
  r:   "\x1b[0m",    // reset
};

/** Convert Minecraft §-codes (and their & variants) to ANSI, then strip any leftovers. */
function mcToAnsi(text: string): string {
  // Replace §x or &x with ANSI sequences
  return text
    .replace(/[§&]([0-9a-fk-or])/gi, (_, code: string) => MC_ANSI[code.toLowerCase()] ?? "")
    // Append reset at end if the line had any codes
    // eslint-disable-next-line no-control-regex
    .replace(/(\x1b\[\d+m.+)$/, "$1\x1b[0m");
}

// Active console subscribers: serverId → Set of senders
const consoleSubs = new Map<string, Set<(msg: string) => void>>();
// Active player subscribers: serverId → Set of senders
const playerSubs = new Map<string, Set<(players: string[]) => void>>();

// Per-connection command rate limiting: wsId → { count, resetAt }
const cmdRateLimit = new Map<string, { count: number; resetAt: number }>();
const CMD_LIMIT = 10;       // max commands per window
const CMD_WINDOW_MS = 1000; // 1-second window

// ── Log file tailing ─────────────────────────────────────────────────────────
interface LogTailer { stop: () => void }
const logTailers = new Map<string, LogTailer>();

/** Start tailing a server log file and pushing new lines to all console subscribers. */
function startLogTailer(serverId: string, logPath: string) {
  if (logTailers.has(serverId)) return;

  let position = 0;
  try {
    position = fs.statSync(logPath).size; // start at end of existing content
  } catch {
    return; // file doesn't exist yet — skip
  }

  const interval = setInterval(() => {
    const subs = consoleSubs.get(serverId);
    if (!subs || subs.size === 0) return;

    let size!: number;
    try { size = fs.statSync(logPath).size; } catch { return; }
    if (size <= position) return;

    const fd = fs.openSync(logPath, "r");
    const buf = Buffer.alloc(size - position);
    fs.readSync(fd, buf, 0, buf.length, position);
    fs.closeSync(fd);
    position = size;

    const lines = buf.toString("utf8").split("\n").filter((l) => l.trim());
    for (const line of lines) {
      for (const send of subs) send(mcToAnsi(line));
    }
  }, 500);

  logTailers.set(serverId, { stop: () => clearInterval(interval) });
}

/** Ensure log tailing is running for a server if it has a logPath configured. */
async function ensureLogTailer(serverId: string) {
  if (logTailers.has(serverId)) return;
  const [server] = await db
    .select({ logPath: schema.servers.logPath })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (server?.logPath) startLogTailer(serverId, server.logPath);
}

function checkCmdRate(wsId: string): boolean {
  const now = Date.now();
  const entry = cmdRateLimit.get(wsId);
  if (!entry || now >= entry.resetAt) {
    cmdRateLimit.set(wsId, { count: 1, resetAt: now + CMD_WINDOW_MS });
    return true;
  }
  if (entry.count >= CMD_LIMIT) return false;
  entry.count++;
  return true;
}

// Poll players every 5 s for any server that has subscribers
setInterval(async () => {
  for (const [serverId, subs] of playerSubs) {
    if (subs.size === 0) continue;
    try {
      const players = await getOnlinePlayers(serverId);
      for (const send of subs) send(players);
    } catch {
      // server unreachable — skip silently
    }
  }
}, 5_000);

export const consoleRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  .use(requireRole("operator"))
  /**
   * WebSocket: live console relay (operator+)
   */
  .ws("/:id/console", {
    async open(ws) {
      // Re-verify session on open (requireRole runs on the HTTP upgrade request,
      // but we guard here too in case the plugin resolution differs)
      if (!ws.data.session?.user) {
        ws.close();
        return;
      }
      const serverId = ws.data.params.id;
      if (!consoleSubs.has(serverId)) consoleSubs.set(serverId, new Set());
      const send = (msg: string) => ws.send(JSON.stringify({ type: "output", data: msg }));
      consoleSubs.get(serverId)!.add(send);
      (ws as unknown as { _consoleSend: typeof send; _wsId: string })._consoleSend = send;
      (ws as unknown as { _consoleSend: typeof send; _wsId: string })._wsId =
        `${ws.data.session.user.id}:${serverId}:${Date.now()}`;
      // Check if the Minecraft server is actually reachable via RCON
      const status = await getServerStatus(serverId).catch(() => null);
      ws.send(JSON.stringify({ type: "connected", serverId, online: status?.online ?? false }));
      // Start tailing log file if configured
      void ensureLogTailer(serverId);
    },
    async message(ws, message) {
      // Mandatory session re-check on every message
      if (!ws.data.session?.user) {
        ws.close();
        return;
      }
      const wsId = (ws as unknown as { _wsId?: string })._wsId ?? "";
      if (!checkCmdRate(wsId)) {
        ws.send(JSON.stringify({ type: "error", data: "Rate limit: slow down" }));
        return;
      }

      const serverId = ws.data.params.id;
      const msg = message as { command?: string };
      if (typeof msg?.command !== "string") return;

      const userName = ws.data.session.user.name;
      // Echo the command to all console subscribers
      for (const send of consoleSubs.get(serverId) ?? []) {
        send(`\x1b[33m[${userName}]\x1b[0m \x1b[36m/${msg.command}\x1b[0m`);
      }

      try {
        const output = await sendCommand(serverId, msg.command);
        if (output.trim()) {
          // Split multi-line RCON responses and convert MC color codes
          const lines = output.split("\n").filter((l) => l.trim());
          for (const line of lines) {
            for (const send of consoleSubs.get(serverId) ?? []) {
              send(mcToAnsi(line));
            }
          }
        }
        await audit({
          userId: ws.data.session.user.id,
          action: "console.command",
          resource: "server",
          resourceId: serverId,
          metadata: { command: msg.command },
        });
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", data: String(e) }));
      }
    },
    close(ws) {
      const serverId = ws.data.params.id;
      const send = (ws as unknown as { _consoleSend?: (msg: string) => void })._consoleSend;
      if (send) consoleSubs.get(serverId)?.delete(send);
      const wsId = (ws as unknown as { _wsId?: string })._wsId;
      if (wsId) cmdRateLimit.delete(wsId);
    },
  });

export const playersRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  /**
   * WebSocket: live player list (all authenticated users)
   */
  .ws("/:id/players", {
    open(ws) {
      const serverId = ws.data.params.id;
      if (!ws.data.session?.user) {
        ws.close();
        return;
      }
      if (!playerSubs.has(serverId)) playerSubs.set(serverId, new Set());
      const send = (players: string[]) =>
        ws.send(JSON.stringify({ type: "players", data: players }));
      playerSubs.get(serverId)!.add(send);
      (ws as unknown as { _playerSend: typeof send })._playerSend = send;
      // Push immediately on connect so client doesn't wait for the first poll tick
      getOnlinePlayers(serverId).then(send).catch(() => {});
    },
    close(ws) {
      const serverId = ws.data.params.id;
      const send = (ws as unknown as { _playerSend?: (p: string[]) => void })._playerSend;
      if (send) playerSubs.get(serverId)?.delete(send);
    },
  });

