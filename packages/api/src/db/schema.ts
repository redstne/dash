import { sqliteTable, text, integer, blob } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Users ─────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  role: text("role", { enum: ["admin", "operator", "viewer"] }).notNull().default("viewer"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ── Sessions (Better Auth) ─────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

// ── Accounts (Better Auth OAuth) ──────────────────────────────────────────
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ── Verifications (Better Auth) ────────────────────────────────────────────
export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// ── Minecraft Servers ─────────────────────────────────────────────────────
export const servers = sqliteTable("servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  rconPort: integer("rcon_port").notNull().default(25575),
  /** Encrypted with AES-256 using ENCRYPTION_KEY env var */
  rconPasswordEncrypted: blob("rcon_password_encrypted", { mode: "buffer" }).notNull(),
  dockerContainerId: text("docker_container_id"),
  dynmapUrl: text("dynmap_url"),
  /** Absolute path to the server's latest.log file (for live console tailing) */
  logPath: text("log_path"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ── Audit Log ─────────────────────────────────────────────────────────────
export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  metadata: text("metadata"), // JSON string
  ip: text("ip"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;

// ── Backup Configs ─────────────────────────────────────────────────────────
export const backupConfigs = sqliteTable("backup_configs", {
  id: text("id").primaryKey(),
  serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** 'local' | 's3' | 'sftp' | 'rclone' */
  storageType: text("storage_type").notNull(),
  /** AES-256-GCM encrypted JSON of storage-specific credentials */
  configEncrypted: blob("config_encrypted", { mode: "buffer" }).notNull(),
  /** 'manual' | 'hourly' | '6h' | 'daily' | 'weekly' */
  schedule: text("schedule").notNull().default("manual"),
  retentionCount: integer("retention_count").notNull().default(7),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ── Backup Runs ────────────────────────────────────────────────────────────
export const backupRuns = sqliteTable("backup_runs", {
  id: text("id").primaryKey(),
  serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  configId: text("config_id").references(() => backupConfigs.id, { onDelete: "set null" }),
  configName: text("config_name"),
  /** 'running' | 'success' | 'failed' */
  status: text("status").notNull(),
  startedAt: integer("started_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  sizeBytes: integer("size_bytes"),
  filename: text("filename"),
  localPath: text("local_path"),
  error: text("error"),
});

export type BackupConfig = typeof backupConfigs.$inferSelect;
export type BackupRun = typeof backupRuns.$inferSelect;

// ── Scheduled Tasks ────────────────────────────────────────────────────────
export const scheduledTasks = sqliteTable("scheduled_tasks", {
  id: text("id").primaryKey(),
  serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** 'command' | 'restart' | 'stop' */
  type: text("type").notNull(),
  /** RCON command to run (only when type='command') */
  command: text("command"),
  /** 'hourly' | '2h' | '6h' | 'daily' | 'weekly' */
  schedule: text("schedule").notNull(),
  /** HH:MM for daily/weekly tasks, null for interval-based */
  timeOfDay: text("time_of_day"),
  /** 0=Sun … 6=Sat for weekly tasks */
  dayOfWeek: integer("day_of_week"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ── Webhooks ───────────────────────────────────────────────────────────────
export const webhooks = sqliteTable("webhooks", {
  id: text("id").primaryKey(),
  serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  /** JSON array of event strings, e.g. ["alert.critical","player.ban"] */
  events: text("events").notNull().default("[]"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;

// ── Player Sessions ────────────────────────────────────────────────────────
export const playerSessions = sqliteTable("player_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  playerName: text("player_name").notNull(),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  leftAt: integer("left_at", { mode: "timestamp" }),
});
export type PlayerSession = typeof playerSessions.$inferSelect;

// ── Server Plugins ─────────────────────────────────────────────────────────
export const serverPlugins = sqliteTable("server_plugins", {
  id: text("id").primaryKey(),
  serverId: text("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  /** Display name */
  name: text("name").notNull(),
  /** Modrinth project slug or null */
  slug: text("slug"),
  /** Version string */
  version: text("version"),
  /** Direct download URL (used to generate PLUGINS_FILE for itzg container) */
  downloadUrl: text("download_url").notNull(),
  /** Installed filename on disk */
  filename: text("filename").notNull(),
  /** "modrinth" | "url" | "filesystem" */
  source: text("source").notNull().default("url"),
  installedAt: integer("installed_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
export type ServerPlugin = typeof serverPlugins.$inferSelect;
