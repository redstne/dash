import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { sendCommand, getServerStatus } from "../../lib/rcon.ts";

export interface LiveInnerData {
  health: number | null;
  maxHealth: number;
  food: number | null;
  saturation: number | null;
  xpLevel: number | null;
  xpProgress: number | null;
  pos: [number, number, number] | null;
  dimension: string | null;
}

export interface PlayerDetailsData {
  name: string;
  uuid: string | null;
  online: boolean;
  lastSeen: string | null;
  lastLoginPos: [number, number, number] | null;
  banned: boolean;
  isOp: boolean;
  stats: Record<string, unknown> | null;
  advancements: { completed: number } | null;
  liveData: LiveInnerData | null;
  recentActivity: string[];
}

export abstract class PlayerService {
  /** Fetch live RCON data for a player (health, food, xp, pos, dimension). */
  static async getLiveData(
    serverId: string,
    name: string,
  ): Promise<{ online: boolean; liveData: LiveInnerData | null }> {
    try {
      const statusData = await getServerStatus(serverId);
      const isOnline = statusData.players.some((p) => p.toLowerCase() === name.toLowerCase());
      if (!isOnline) return { online: false, liveData: null };
      try {
        const sid = serverId;
        const n = name;
        const [healthR, foodR, foodSatR, xpLevelR, xpPR, posR, dimR] = await Promise.all([
          sendCommand(sid, `data get entity ${n} Health`),
          sendCommand(sid, `data get entity ${n} foodLevel`),
          sendCommand(sid, `data get entity ${n} foodSaturationLevel`),
          sendCommand(sid, `data get entity ${n} XpLevel`),
          sendCommand(sid, `data get entity ${n} XpP`),
          sendCommand(sid, `data get entity ${n} Pos`),
          sendCommand(sid, `data get entity ${n} Dimension`),
        ]);
        const health = healthR.match(/entity data: ([\d.]+)f/)?.[1];
        const food = foodR.match(/entity data: (\d+)/)?.[1];
        const sat = foodSatR.match(/entity data: ([\d.]+)f/)?.[1];
        const xpLevel = xpLevelR.match(/entity data: (\d+)/)?.[1];
        const xpP = xpPR.match(/entity data: ([\d.]+)f/)?.[1];
        const posM = posR.match(/entity data: \[(-?[\d.]+)d, (-?[\d.]+)d, (-?[\d.]+)d\]/);
        const dim = dimR.match(/entity data: "([^"]+)"/)?.[1] ?? null;
        return {
          online: true,
          liveData: {
            health: health ? parseFloat(health) : null,
            maxHealth: 20,
            food: food ? parseInt(food) : null,
            saturation: sat ? parseFloat(sat) : null,
            xpLevel: xpLevel ? parseInt(xpLevel) : null,
            xpProgress: xpP ? parseFloat(xpP) : null,
            pos: posM ? [parseFloat(posM[1]!), parseFloat(posM[2]!), parseFloat(posM[3]!)] : null,
            dimension: dim,
          },
        };
      } catch (err) {
        console.error(`[players/live] data get entity failed for ${name}:`, err);
        return { online: true, liveData: { health: null, maxHealth: 20, food: null, saturation: null, xpLevel: null, xpProgress: null, pos: null, dimension: null } };
      }
    } catch (err) {
      console.error(`[players/live] getServerStatus failed:`, err);
      return { online: false, liveData: null };
    }
  }

  /** Read detailed player data from filesystem and RCON. */
  static async getDetails(
    serverId: string,
    name: string,
    serverRoot: string | null,
  ): Promise<PlayerDetailsData> {
    const root = serverRoot;

    // ── UUID via usercache.json ──────────────────────────────────────────
    let uuid: string | null = null;
    if (root) {
      try {
        const cache = JSON.parse(readFileSync(path.join(root, "usercache.json"), "utf8")) as { uuid: string; name: string }[];
        uuid = cache.find((e) => e.name.toLowerCase() === name.toLowerCase())?.uuid ?? null;
      } catch { /* file may not exist */ }
    }

    // ── Stats JSON ───────────────────────────────────────────────────────
    let stats: Record<string, unknown> | null = null;
    if (root && uuid) {
      try {
        const raw = JSON.parse(readFileSync(path.join(root, "world", "stats", `${uuid}.json`), "utf8"));
        const custom = (raw.stats?.["minecraft:custom"] ?? {}) as Record<string, number>;
        const mined = (raw.stats?.["minecraft:mined"] ?? {}) as Record<string, number>;
        const crafted = (raw.stats?.["minecraft:crafted"] ?? {}) as Record<string, number>;
        const killedBy = (raw.stats?.["minecraft:killed_by"] ?? {}) as Record<string, number>;
        const killed = (raw.stats?.["minecraft:killed"] ?? {}) as Record<string, number>;
        stats = {
          deaths: custom["minecraft:deaths"] ?? 0,
          mobKills: custom["minecraft:mob_kills"] ?? 0,
          playerKills: custom["minecraft:player_kills"] ?? 0,
          playTimeTicks: custom["minecraft:play_time"] ?? 0,
          jumpCount: custom["minecraft:jump"] ?? 0,
          damageTaken: custom["minecraft:damage_taken"] ?? 0,
          damageDealt: custom["minecraft:damage_dealt"] ?? 0,
          walkCm: custom["minecraft:walk_one_cm"] ?? 0,
          sprintCm: custom["minecraft:sprint_one_cm"] ?? 0,
          flyCm: custom["minecraft:fly_one_cm"] ?? 0,
          blocksMined: Object.values(mined).reduce((a, b) => a + b, 0),
          itemsCrafted: Object.values(crafted).reduce((a, b) => a + b, 0),
          topMinedBlocks: Object.entries(mined).sort((a, b) => b[1] - a[1]).slice(0, 5),
          killedBy: Object.entries(killedBy).sort((a, b) => b[1] - a[1]).slice(0, 5),
          topKilled: Object.entries(killed).sort((a, b) => b[1] - a[1]).slice(0, 5),
        };
      } catch { /* stats file may not exist */ }
    }

    // ── Advancements ─────────────────────────────────────────────────────
    let advancements: { completed: number } | null = null;
    if (root && uuid) {
      try {
        const raw = JSON.parse(readFileSync(path.join(root, "world", "advancements", `${uuid}.json`), "utf8")) as Record<string, { done?: boolean }>;
        const completed = Object.values(raw).filter((v) => v?.done === true).length;
        advancements = { completed };
      } catch { /* advancements file may not exist */ }
    }

    // ── Log-based activity ───────────────────────────────────────────────
    let lastSeen: string | null = null;
    let lastLoginPos: [number, number, number] | null = null;
    let recentActivity: string[] = [];
    if (root) {
      try {
        const logPath = path.join(root, "logs", "latest.log");
        const lines = existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n") : [];
        const nameSafe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const matchingLines: string[] = [];

        for (const line of lines) {
          if (!line.includes(name)) continue;
          matchingLines.push(line);
          const posM = line.match(new RegExp(`${nameSafe}\\[.+?\\] logged in with entity id \\d+ at \\(\\[.+?\\](-?[\\d.]+), (-?[\\d.]+), (-?[\\d.]+)\\)`));
          if (posM) lastLoginPos = [parseFloat(posM[1]!), parseFloat(posM[2]!), parseFloat(posM[3]!)];
          if (/joined the game|left the game/.test(line)) lastSeen = line;
        }
        recentActivity = matchingLines.filter((l) =>
          /joined the game|left the game|issued server command|<.+?>/.test(l)
        // eslint-disable-next-line no-control-regex
        ).slice(-10).map((l) => l.replace(/\u001b\[[0-9;]*m/g, "").trim());
      } catch { /* log file may not exist */ }
    }

    // ── Live data via RCON ───────────────────────────────────────────────
    let liveData: LiveInnerData | null = null;
    let playerOnline = false;
    try {
      const statusData = await getServerStatus(serverId);
      playerOnline = statusData.players.some((p) => p.toLowerCase() === name.toLowerCase());
      if (playerOnline) {
        try {
          const n = name;
          const sid = serverId;
          const [healthR, foodR, foodSatR, xpLevelR, xpPR, posR, dimR] = await Promise.all([
            sendCommand(sid, `data get entity ${n} Health`),
            sendCommand(sid, `data get entity ${n} foodLevel`),
            sendCommand(sid, `data get entity ${n} foodSaturationLevel`),
            sendCommand(sid, `data get entity ${n} XpLevel`),
            sendCommand(sid, `data get entity ${n} XpP`),
            sendCommand(sid, `data get entity ${n} Pos`),
            sendCommand(sid, `data get entity ${n} Dimension`),
          ]);
          const health = healthR.match(/entity data: ([\d.]+)f/)?.[1];
          const food = foodR.match(/entity data: (\d+)/)?.[1];
          const sat = foodSatR.match(/entity data: ([\d.]+)f/)?.[1];
          const xpLevel = xpLevelR.match(/entity data: (\d+)/)?.[1];
          const xpP = xpPR.match(/entity data: ([\d.]+)f/)?.[1];
          const posM = posR.match(/entity data: \[(-?[\d.]+)d, (-?[\d.]+)d, (-?[\d.]+)d\]/);
          const dim = dimR.match(/entity data: "([^"]+)"/)?.[1] ?? null;
          liveData = {
            health: health ? parseFloat(health) : null,
            maxHealth: 20,
            food: food ? parseInt(food) : null,
            saturation: sat ? parseFloat(sat) : null,
            xpLevel: xpLevel ? parseInt(xpLevel) : null,
            xpProgress: xpP ? parseFloat(xpP) : null,
            pos: posM ? [parseFloat(posM[1]!), parseFloat(posM[2]!), parseFloat(posM[3]!)] : null,
            dimension: dim,
          };
        } catch {
          liveData = { health: null, maxHealth: 20, food: null, saturation: null, xpLevel: null, xpProgress: null, pos: null, dimension: null };
        }
      }
    } catch { /* RCON unavailable */ }

    // ── Ban / Op status ──────────────────────────────────────────────────
    let banned = false;
    let isOp = false;
    if (root) {
      try {
        const bannedList = JSON.parse(readFileSync(path.join(root, "banned-players.json"), "utf8")) as { uuid?: string; name?: string }[];
        banned = bannedList.some((e) => (uuid && e.uuid === uuid) || e.name?.toLowerCase() === name.toLowerCase());
      } catch { /* file may not exist */ }
      try {
        const opsList = JSON.parse(readFileSync(path.join(root, "ops.json"), "utf8")) as { uuid?: string; name?: string }[];
        isOp = opsList.some((e) => (uuid && e.uuid === uuid) || e.name?.toLowerCase() === name.toLowerCase());
      } catch { /* file may not exist */ }
    }

    return { name, uuid, online: playerOnline, lastSeen, lastLoginPos, banned, isOp, stats, advancements, liveData, recentActivity };
  }
}
