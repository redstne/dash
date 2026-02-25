import Elysia from "elysia";
import { authPlugin, requireRole } from "../plugins/rbac.ts";
import { getHistory } from "../lib/analytics.ts";
import { getServerStatus } from "../lib/rcon.ts";
import { db, schema } from "../db/index.ts";
import { eq } from "drizzle-orm";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// ── Log-pattern alert definitions ──────────────────────────────────────────
interface AlertDef {
  re: RegExp;
  severity: "critical" | "warning" | "info";
  message: string;
}

const ALERT_PATTERNS: AlertDef[] = [
  { re: /Can't keep up!/i, severity: "warning", message: "Server lag: can't keep up" },
  { re: /OutOfMemoryError/i, severity: "critical", message: "Java heap out of memory" },
  { re: /\[Server thread\/ERROR\]/i, severity: "warning", message: "Server thread error" },
  { re: /Crashed/i, severity: "critical", message: "Server crashed" },
  { re: /\[WARN\].*Exception/i, severity: "warning", message: "Plugin exception" },
  { re: /Stopping the server/i, severity: "info", message: "Server stopped" },
  { re: /Starting minecraft server/i, severity: "info", message: "Server started" },
];

// Parse Minecraft log timestamp [HH:MM:SS] → today's ISO date string
function parseLogTime(line: string): string {
  const m = line.match(/^\[(\d{2}):(\d{2}):(\d{2})\]/);
  if (!m) return new Date().toISOString();
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(m[1]),
    Number(m[2]),
    Number(m[3])
  ).toISOString();
}

function deriveServerRoot(logPath: string): string {
  const parts = logPath.split("/");
  const logsIdx = parts.lastIndexOf("logs");
  if (logsIdx === -1) throw new Error("Cannot derive server root from logPath");
  return parts.slice(0, logsIdx).join("/") || "/";
}

async function getServerLogPath(serverId: string): Promise<string | null> {
  const [server] = await db
    .select({ logPath: schema.servers.logPath })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  return server?.logPath ?? null;
}

function readLastLines(filePath: string, n: number): string[] {
  if (!existsSync(filePath)) return [];
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

// ── Analytics helpers ──────────────────────────────────────────────────────
function parseLogStats(logPath: string | null) {
  if (!logPath) return { joinsToday: 0, leavesToday: 0, chatToday: 0 };
  const root = (() => {
    try { return deriveServerRoot(logPath); } catch { return null; }
  })();
  if (!root) return { joinsToday: 0, leavesToday: 0, chatToday: 0 };

  const latestLog = path.join(root, "logs", "latest.log");
  const lines = readLastLines(latestLog, 2000);

  let joinsToday = 0, leavesToday = 0, chatToday = 0;
  for (const line of lines) {
    if (/logged in with entity id|joined the game/i.test(line)) joinsToday++;
    else if (/left the game/i.test(line)) leavesToday++;
    else if (/\[Server thread\/INFO\].*<.*>/i.test(line)) chatToday++;
  }
  return { joinsToday, leavesToday, chatToday };
}

// ── Alert helpers ─────────────────────────────────────────────────────────
interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  detail: string;
  at: string;
  source: "log" | "status";
}

function parseLogAlerts(logPath: string | null): Alert[] {
  if (!logPath) return [];
  const root = (() => {
    try { return deriveServerRoot(logPath); } catch { return null; }
  })();
  if (!root) return [];

  const latestLog = path.join(root, "logs", "latest.log");
  const lines = readLastLines(latestLog, 500);
  const alerts: Alert[] = [];
  const seen = new Set<string>(); // deduplicate same message within window

  lines.forEach((line, idx) => {
    for (const def of ALERT_PATTERNS) {
      if (def.re.test(line)) {
        const key = `${def.message}:${line.slice(0, 60)}`;
        if (!seen.has(key)) {
          seen.add(key);
          alerts.push({
            id: `log-${idx}`,
            severity: def.severity,
            message: def.message,
            detail: line.replace(/\u001b\[[0-9;]*m/g, "").trim(),
            at: parseLogTime(line),
            source: "log",
          });
        }
        break;
      }
    }
  });

  return alerts;
}

// ── Routes ─────────────────────────────────────────────────────────────────
export const analyticsRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  .use(requireRole("viewer"))

  .get("/:id/analytics", async ({ params, set }) => {
    const logPath = await getServerLogPath(params.id);
    const history = getHistory(params.id);
    const logStats = parseLogStats(logPath);

    const tpsHistory = history.map((s) => ({ at: s.at, tps: s.tps }));
    const playerHistory = history.map((s) => ({ at: s.at, count: s.players }));

    return { tpsHistory, playerHistory, ...logStats };
  })

  .get("/:id/alerts", async ({ params }) => {
    const logPath = await getServerLogPath(params.id);
    const alerts = parseLogAlerts(logPath);

    // Add live status alerts
    try {
      const status = await getServerStatus(params.id);
      if (!status.online) {
        alerts.unshift({
          id: "status-offline",
          severity: "critical",
          message: "Server is offline",
          detail: "The Minecraft server is not responding to RCON commands.",
          at: new Date().toISOString(),
          source: "status",
        });
      } else if (status.tps !== null && status.tps < 15) {
        alerts.unshift({
          id: "status-tps-critical",
          severity: "critical",
          message: `TPS critical: ${status.tps.toFixed(1)}`,
          detail: `Current TPS is ${status.tps.toFixed(1)} (below 15). Server is severely lagging.`,
          at: new Date().toISOString(),
          source: "status",
        });
      } else if (status.tps !== null && status.tps < 18) {
        alerts.unshift({
          id: "status-tps-warning",
          severity: "warning",
          message: `TPS warning: ${status.tps.toFixed(1)}`,
          detail: `Current TPS is ${status.tps.toFixed(1)} (below 18). Server may be experiencing lag.`,
          at: new Date().toISOString(),
          source: "status",
        });
      }
    } catch { /* RCON unavailable, skip live status alerts */ }

    // Sort: critical first, then warning, then info; newest first within group
    const order = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity] || b.at.localeCompare(a.at));

    return { alerts };
  });
