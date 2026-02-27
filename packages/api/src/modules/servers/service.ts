import { readFileSync, existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export abstract class ServerService {
  /** Parse a server.properties file into a key-value map. */
  static parseProperties(content: string): Record<string, string> {
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
  static mergeProperties(content: string, updates: Record<string, string>): string {
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
    for (const [k, v] of Object.entries(updates)) {
      if (!seen.has(k)) result.push(`${k}=${v}`);
    }
    return result.join("\n");
  }

  /** Derive server.properties path from a server's logPath (/data/mc/logs/latest.log → /data/mc/server.properties). */
  static derivePropertiesPath(logPath: string | null): string | null {
    if (!logPath) return null;
    const parts = logPath.split("/");
    const logsIdx = parts.lastIndexOf("logs");
    if (logsIdx === -1) return null;
    return [...parts.slice(0, logsIdx), "server.properties"].join("/");
  }

  /** Derive server root directory from logPath (/data/mc/logs/latest.log → /data/mc). */
  static deriveServerRoot(logPath: string): string {
    const parts = logPath.split("/");
    const logsIdx = parts.lastIndexOf("logs");
    if (logsIdx === -1) throw new Error("Cannot derive server root from logPath");
    return parts.slice(0, logsIdx).join("/") || "/";
  }

  /** Parse a .jar filename into name and version. */
  static parseJarName(filename: string): { name: string; version: string } {
    const base = filename.replace(/\.jar$/i, "");
    const match = base.match(/^(.+?)[-_]v?(\d[\w.\-+]*)$/);
    if (match) return { name: match[1]!, version: match[2]! };
    return { name: base, version: "" };
  }

  /** Detect whether the server uses plugins/ or mods/ and return the dir. */
  static derivePluginsDir(logPath: string | null): { type: "plugins" | "mods" | "none"; dir: string } {
    const propsPath = ServerService.derivePropertiesPath(logPath);
    if (!propsPath) return { type: "none", dir: "" };
    const base = path.dirname(propsPath);
    const pluginsDir = path.join(base, "plugins");
    const modsDir = path.join(base, "mods");
    if (existsSync(pluginsDir)) return { type: "plugins", dir: pluginsDir };
    if (existsSync(modsDir)) return { type: "mods", dir: modsDir };
    return { type: "none", dir: "" };
  }

  /** Returns base IPs of all non-loopback IPv4 interfaces (e.g. ["192.168.1", "172.17.0"]) */
  static getLocalSubnetBases(): string[] {
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
  static getOwnIps(): Set<string> {
    const ips = new Set<string>();
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const addr of ifaces ?? []) {
        if (addr.family === "IPv4") ips.add(addr.address);
      }
    }
    return ips;
  }

  /** Returns gateway IPs by parsing /proc/net/route (Linux). Silently returns empty set elsewhere. */
  static getGatewayIps(): Set<string> {
    const gateways = new Set<string>();
    try {
      const lines = readFileSync("/proc/net/route", "utf8").trim().split("\n").slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const gw = parts[2];
        if (!gw || gw === "00000000") continue;
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
  static probePort(host: string, port: number, timeoutMs = 400): Promise<boolean> {
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
  static async scanSubnet(base: string, port: number, concurrency = 50): Promise<string[]> {
    const hosts = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);
    const found: string[] = [];
    for (let i = 0; i < hosts.length; i += concurrency) {
      const batch = hosts.slice(i, i + concurrency);
      const results = await Promise.all(batch.map((h) => ServerService.probePort(h, port).then((ok) => (ok ? h : null))));
      for (const h of results) if (h) found.push(h);
    }
    return found;
  }
}
