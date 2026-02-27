import Elysia from "elysia";
import { authPlugin } from "../../plugins/rbac.ts";
import { db, schema } from "../../db/index.ts";
import { eq } from "drizzle-orm";
import { statfsSync } from "node:fs";

const DOCKER_SOCKET = "/var/run/docker.sock";

interface DockerStats {
  cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
  memory_stats: { usage: number; limit: number };
}

async function getDockerStats(containerId: string): Promise<DockerStats | null> {
  try {
    const res = await fetch(`http://localhost/containers/${containerId}/stats?stream=false`, {
      // @ts-ignore — Bun supports unix socket via this undocumented option
      unix: DOCKER_SOCKET,
    });
    if (!res.ok) return null;
    return res.json() as Promise<DockerStats>;
  } catch {
    return null;
  }
}

function calcCpuPercent(stats: DockerStats): number {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus ?? 1;
  if (systemDelta <= 0 || cpuDelta < 0) return 0;
  return Math.min(100, (cpuDelta / systemDelta) * cpuCount * 100);
}

export const resourcesRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)

  .get("/:id/resources", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");

    const [server] = await db
      .select({ dockerContainerId: schema.servers.dockerContainerId, logPath: schema.servers.logPath })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    if (!server) return status(404, "Server not found");

    let cpu: number | null = null;
    let ramUsed: number | null = null;
    let ramTotal: number | null = null;
    let diskUsed: number | null = null;
    let diskTotal: number | null = null;
    let available = false;

    if (server.dockerContainerId) {
      const stats = await getDockerStats(server.dockerContainerId);
      if (stats) {
        available = true;
        cpu = parseFloat(calcCpuPercent(stats).toFixed(1));
        ramUsed = stats.memory_stats.usage;
        ramTotal = stats.memory_stats.limit;
      }
    }

    // Disk: read from server mount point if logPath is set
    if (server.logPath) {
      try {
        const parts = server.logPath.split("/");
        const logsIdx = parts.lastIndexOf("logs");
        const root = logsIdx !== -1 ? parts.slice(0, logsIdx).join("/") || "/" : "/";
        const fs = statfsSync(root);
        diskTotal = fs.bsize * fs.blocks;
        diskUsed = diskTotal - fs.bsize * fs.bfree;
        available = true;
      } catch { /* ignore */ }
    }

    return { available, cpu, ramUsed, ramTotal, diskUsed, diskTotal };
  });
