import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../../plugins/rbac.ts";
import { db, schema } from "../../db/index.ts";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { audit } from "../../lib/audit.ts";
import {
  encryptConfig,
  runBackup,
  type BackupStorageConfig,
} from "../../lib/backup.ts";

export const backupsRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  .use(requireRole("operator"))

  // ── List backup configs ─────────────────────────────────────────────────
  .get("/:id/backups/configs", async ({ params, session, set }) => {
    if (!session?.user) return set.status = 401;
    const configs = await db
      .select({
        id: schema.backupConfigs.id,
        name: schema.backupConfigs.name,
        storageType: schema.backupConfigs.storageType,
        schedule: schema.backupConfigs.schedule,
        retentionCount: schema.backupConfigs.retentionCount,
        enabled: schema.backupConfigs.enabled,
        lastRunAt: schema.backupConfigs.lastRunAt,
        createdAt: schema.backupConfigs.createdAt,
      })
      .from(schema.backupConfigs)
      .where(eq(schema.backupConfigs.serverId, params.id));
    return configs;
  })

  // ── Create backup config ────────────────────────────────────────────────
  .post(
    "/:id/backups/configs",
    async ({ params, body, session, set }) => {
      if (!session?.user) return set.status = 401;

      const configEncrypted = await encryptConfig(body.config as BackupStorageConfig);

      const id = randomUUID();
      await db.insert(schema.backupConfigs).values({
        id,
        serverId: params.id,
        name: body.name,
        storageType: body.config.type,
        configEncrypted,
        schedule: body.schedule ?? "manual",
        retentionCount: body.retentionCount ?? 7,
        enabled: true,
      });

      await audit({ userId: session.user.id, action: "backup_config.create", resource: "backup_config", resourceId: id });
      return { id };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        config: t.Object({
          type: t.String(),
        }, { additionalProperties: true }),
        schedule: t.Optional(t.String()),
        retentionCount: t.Optional(t.Number()),
      }),
    }
  )

  // ── Update backup config ────────────────────────────────────────────────
  .put(
    "/:id/backups/configs/:configId",
    async ({ params, body, session, set }) => {
      if (!session?.user) return set.status = 401;

      const updates: Partial<typeof schema.backupConfigs.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body.name) updates.name = body.name;
      if (body.schedule) updates.schedule = body.schedule;
      if (body.retentionCount !== undefined) updates.retentionCount = body.retentionCount;
      if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
      if (body.config) {
        updates.configEncrypted = await encryptConfig(body.config as BackupStorageConfig);
        updates.storageType = body.config.type;
      }

      await db.update(schema.backupConfigs)
        .set(updates)
        .where(
          and(
            eq(schema.backupConfigs.id, params.configId),
            eq(schema.backupConfigs.serverId, params.id)
          )
        );
      return { ok: true };
    },
    {
      body: t.Object({
        name: t.Optional(t.String()),
        config: t.Optional(t.Object({ type: t.String() }, { additionalProperties: true })),
        schedule: t.Optional(t.String()),
        retentionCount: t.Optional(t.Number()),
        enabled: t.Optional(t.Boolean()),
      }),
    }
  )

  // ── Delete backup config ────────────────────────────────────────────────
  .delete("/:id/backups/configs/:configId", async ({ params, session, set }) => {
    if (!session?.user) return set.status = 401;
    await db.delete(schema.backupConfigs).where(
      and(
        eq(schema.backupConfigs.id, params.configId),
        eq(schema.backupConfigs.serverId, params.id)
      )
    );
    return { ok: true };
  })

  // ── List backup runs ────────────────────────────────────────────────────
  .get("/:id/backups/runs", async ({ params, session, set }) => {
    if (!session?.user) return set.status = 401;
    const runs = await db
      .select()
      .from(schema.backupRuns)
      .where(eq(schema.backupRuns.serverId, params.id))
      .orderBy(desc(schema.backupRuns.startedAt))
      .limit(50);
    return runs;
  })

  // ── Trigger manual backup ───────────────────────────────────────────────
  .post(
    "/:id/backups/trigger",
    async ({ params, body, session, set }) => {
      if (!session?.user) return set.status = 401;

      const runId = await runBackup(params.id, body.configId);
      await audit({ userId: session.user.id, action: "backup.trigger", resource: "server", resourceId: params.id });
      return { runId };
    },
    {
      body: t.Object({
        configId: t.String(),
      }),
    }
  )

  // ── Download local backup ───────────────────────────────────────────────
  .get("/:id/backups/runs/:runId/download", async ({ params, session, set }) => {
    if (!session?.user) return set.status = 401;

    const [run] = await db
      .select({ localPath: schema.backupRuns.localPath, filename: schema.backupRuns.filename, status: schema.backupRuns.status })
      .from(schema.backupRuns)
      .where(
        and(
          eq(schema.backupRuns.id, params.runId),
          eq(schema.backupRuns.serverId, params.id)
        )
      )
      .limit(1);

    if (!run) return set.status = 404;
    if (run.status !== "success") return set.status = 400;
    if (!run.localPath || !existsSync(run.localPath)) return set.status = 404;

    set.headers["Content-Type"] = "application/gzip";
    set.headers["Content-Disposition"] = `attachment; filename="${run.filename}"`;
    return Bun.file(run.localPath);
  });
