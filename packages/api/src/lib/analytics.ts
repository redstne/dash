/**
 * In-memory ring buffer for TPS + player count history.
 * Samples are recorded whenever getServerStatus makes a fresh RCON call.
 * Max 288 samples per server (24h at 5-min granularity).
 */

export interface Sample {
  at: number;    // Unix ms
  tps: number | null;
  players: number;
}

const HISTORY_MAX = 288;
const history = new Map<string, Sample[]>();

export function recordSample(serverId: string, tps: number | null, players: number) {
  const buf = history.get(serverId) ?? [];
  buf.push({ at: Date.now(), tps, players });
  if (buf.length > HISTORY_MAX) buf.shift();
  history.set(serverId, buf);
}

export function getHistory(serverId: string): Sample[] {
  return history.get(serverId) ?? [];
}
