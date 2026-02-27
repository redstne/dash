/**
 * Backup execution library.
 * Supports: local, S3-compatible, SFTP, and pre-configured rclone remotes.
 */

import { db, schema } from "../db/index.ts";
import { eq, and, ne, asc } from "drizzle-orm";
import { encrypt, decrypt } from "./crypto.ts";
import { existsSync, mkdirSync } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────────

export type StorageType = "local" | "s3" | "sftp" | "rclone";

export interface LocalConfig {
  type: "local";
  /** Destination directory on the host. Defaults to /data/backups/{serverId} */
  path?: string;
}

export interface S3Config {
  type: "s3";
  endpoint: string;       // e.g. s3.amazonaws.com or s3.us-west-004.backblazeb2.com
  region: string;         // e.g. us-east-1
  bucket: string;
  prefix: string;         // path inside bucket, e.g. minecraft/backups
  accessKey: string;
  secretKey: string;
}

export interface SftpConfig {
  type: "sftp";
  host: string;
  port: number;
  user: string;
  password: string;
  path: string;           // remote destination path
}

export interface RcloneConfig {
  type: "rclone";
  remote: string;         // pre-configured rclone remote name, e.g. "proton"
  path: string;           // path on the remote, e.g. "Backups/minecraft"
}

export type BackupStorageConfig = LocalConfig | S3Config | SftpConfig | RcloneConfig;

// ── Encrypt / decrypt config ───────────────────────────────────────────────

export async function encryptConfig(config: BackupStorageConfig): Promise<Buffer> {
  return encrypt(JSON.stringify(config));
}

export async function decryptConfig(encrypted: Buffer): Promise<BackupStorageConfig> {
  const json = await decrypt(encrypted);
  return JSON.parse(json) as BackupStorageConfig;
}

// ── Server root resolution ─────────────────────────────────────────────────

function deriveServerRoot(logPath: string): string {
  const parts = logPath.split("/");
  const logsIdx = parts.lastIndexOf("logs");
  if (logsIdx === -1) throw new Error("Cannot derive server root from logPath");
  return parts.slice(0, logsIdx).join("/") || "/";
}

// ── rclone config file writer ──────────────────────────────────────────────

async function obscurePassword(password: string): Promise<string> {
  const proc = Bun.spawn(["rclone", "obscure", password], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  return text.trim();
}

async function writeRcloneConfig(runId: string, config: BackupStorageConfig): Promise<string | null> {
  const confPath = `/tmp/rclone-${runId}.conf`;

  if (config.type === "s3") {
    const content = `[remote]
type = s3
provider = Other
access_key_id = ${config.accessKey}
secret_access_key = ${config.secretKey}
endpoint = ${config.endpoint}
region = ${config.region}
`;
    await Bun.write(confPath, content);
    return confPath;
  }

  if (config.type === "sftp") {
    const obscured = await obscurePassword(config.password);
    const content = `[remote]
type = sftp
host = ${config.host}
port = ${config.port}
user = ${config.user}
pass = ${obscured}
`;
    await Bun.write(confPath, content);
    return confPath;
  }

  // For "rclone" type, use the system rclone config (mounted from host)
  return null;
}

// ── Core backup execution ─────────────────────────────────────────────────

export async function runBackup(serverId: string, configId: string): Promise<string> {
  const runId = randomUUID();

  // Fetch server + config
  const [server] = await db
    .select({ logPath: schema.servers.logPath, name: schema.servers.name })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (!server) throw new Error("Server not found");

  const [config] = await db
    .select()
    .from(schema.backupConfigs)
    .where(eq(schema.backupConfigs.id, configId))
    .limit(1);
  if (!config) throw new Error("Backup config not found");

  const storageConfig = await decryptConfig(config.configEncrypted);
  const serverRoot = server.logPath ? deriveServerRoot(server.logPath) : null;

  // Record run as "running"
  await db.insert(schema.backupRuns).values({
    id: runId,
    serverId,
    configId,
    configName: config.name,
    status: "running",
    startedAt: new Date(),
  });

  // Run backup asynchronously (don't block the caller)
  executeBackup(runId, serverId, configId, serverRoot, storageConfig, config).catch(
    (err) => console.error(`[backup] run ${runId} failed:`, err)
  );

  return runId;
}

async function executeBackup(
  runId: string,
  serverId: string,
  configId: string,
  serverRoot: string | null,
  storageConfig: BackupStorageConfig,
  config: typeof schema.backupConfigs.$inferSelect
) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `backup-${serverId}-${timestamp}.tar.gz`;
  const tmpFile = `/tmp/${filename}`;
  let rcloneConf: string | null = null;

  try {
    if (!serverRoot) throw new Error("Server root path unknown (no logPath configured)");

    // 1. Create tar archive
    const tarProc = Bun.spawn([
      "tar", "-czf", tmpFile,
      "--exclude=logs",
      "--exclude=crash-reports",
      "--exclude=*.log",
      "-C", serverRoot,
      ".",
    ], { stdout: "pipe", stderr: "pipe" });
    const tarExit = await tarProc.exited;
    if (tarExit !== 0) {
      const stderr = await new Response(tarProc.stderr).text();
      throw new Error(`tar failed (exit ${tarExit}): ${stderr.trim()}`);
    }

    const fileStat = await stat(tmpFile);
    const sizeBytes = fileStat.size;

    // 2. Upload to destination
    let localPath: string | undefined;

    if (storageConfig.type === "local") {
      const destDir = storageConfig.path ?? `/data/backups/${serverId}`;
      mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, filename);
      const copyProc = Bun.spawn(["cp", tmpFile, destPath], { stdout: "pipe", stderr: "pipe" });
      const cpExit = await copyProc.exited;
      if (cpExit !== 0) throw new Error("Failed to copy backup to local destination");
      localPath = destPath;
    } else {
      // rclone upload
      rcloneConf = await writeRcloneConfig(runId, storageConfig);
      let remoteDest: string;

      if (storageConfig.type === "s3") {
        remoteDest = `remote:${storageConfig.bucket}/${storageConfig.prefix}/`.replace(/\/+$/, "/");
      } else if (storageConfig.type === "sftp") {
        remoteDest = `remote:${storageConfig.path}/`;
      } else {
        // pre-configured rclone remote
        remoteDest = `${storageConfig.remote}:${storageConfig.path}/`;
      }

      const rcloneArgs = ["rclone", "copy", "--no-traverse", tmpFile, remoteDest];
      if (rcloneConf) rcloneArgs.splice(1, 0, `--config=${rcloneConf}`);

      const rcloneProc = Bun.spawn(rcloneArgs, { stdout: "pipe", stderr: "pipe" });
      const rcloneExit = await rcloneProc.exited;
      if (rcloneExit !== 0) {
        const stderr = await new Response(rcloneProc.stderr).text();
        throw new Error(`rclone failed (exit ${rcloneExit}): ${stderr.trim()}`);
      }
    }

    // 3. Update run as success
    await db.update(schema.backupRuns)
      .set({ status: "success", finishedAt: new Date(), sizeBytes, filename, localPath })
      .where(eq(schema.backupRuns.id, runId));

    // 4. Update config lastRunAt
    await db.update(schema.backupConfigs)
      .set({ lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.backupConfigs.id, configId));

    // 5. Apply retention policy
    await applyRetention(serverId, configId, config.retentionCount);

    console.log(`[backup] ✅ run ${runId} complete (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[backup] ❌ run ${runId} error:`, error);
    await db.update(schema.backupRuns)
      .set({ status: "failed", finishedAt: new Date(), error })
      .where(eq(schema.backupRuns.id, runId));
  } finally {
    // Cleanup temp files
    try { await unlink(tmpFile); } catch { /* already gone */ }
    if (rcloneConf) try { await unlink(rcloneConf); } catch { /* already gone */ }
  }
}

// ── Retention policy ─────────────────────────────────────────────────────

async function applyRetention(serverId: string, configId: string, keep: number) {
  const runs = await db
    .select({ id: schema.backupRuns.id, localPath: schema.backupRuns.localPath })
    .from(schema.backupRuns)
    .where(
      and(
        eq(schema.backupRuns.serverId, serverId),
        eq(schema.backupRuns.configId as any, configId),
        eq(schema.backupRuns.status, "success")
      )
    )
    .orderBy(asc(schema.backupRuns.startedAt));

  if (runs.length <= keep) return;

  const toDelete = runs.slice(0, runs.length - keep);
  for (const run of toDelete) {
    if (run.localPath && existsSync(run.localPath)) {
      try { await unlink(run.localPath); } catch { /* file may be gone */ }
    }
    await db.delete(schema.backupRuns).where(eq(schema.backupRuns.id, run.id));
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────

const SCHEDULE_INTERVALS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

function isBackupDue(config: typeof schema.backupConfigs.$inferSelect): boolean {
  if (config.schedule === "manual") return false;
  const interval = SCHEDULE_INTERVALS[config.schedule];
  if (!interval) return false;
  if (!config.lastRunAt) return true;
  return Date.now() - config.lastRunAt.getTime() >= interval;
}

export function startBackupScheduler() {
  setInterval(async () => {
    try {
      const configs = await db
        .select()
        .from(schema.backupConfigs)
        .where(
          and(
            eq(schema.backupConfigs.enabled, true),
            ne(schema.backupConfigs.schedule, "manual")
          )
        );
      for (const config of configs) {
        if (isBackupDue(config)) {
          console.log(`[backup] scheduler: triggering backup "${config.name}" for server ${config.serverId}`);
          runBackup(config.serverId, config.id).catch(console.error);
        }
      }
    } catch (err) {
      console.error("[backup] scheduler error:", err);
    }
  }, 60_000); // check every minute
}
