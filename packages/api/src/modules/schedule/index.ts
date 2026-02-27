import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../../plugins/rbac.ts";
import { db, schema } from "../../db/index.ts";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { audit } from "../../lib/audit.ts";
import { sendCommand } from "../../lib/rcon.ts";

const SCHEDULE_INTERVALS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export function isDue(task: typeof schema.scheduledTasks.$inferSelect): boolean {
  const now = new Date();
  const last = task.lastRunAt ? new Date(task.lastRunAt) : null;

  if (task.schedule === "daily" || task.schedule === "weekly") {
    if (!task.timeOfDay) return false;
    const [hh, mm] = task.timeOfDay.split(":").map(Number);
    const nowH = now.getUTCHours(), nowM = now.getUTCMinutes();
    // Only fire in the minute window matching timeOfDay
    if (nowH !== hh || nowM !== mm) return false;
    if (task.schedule === "weekly") {
      if (task.dayOfWeek !== null && task.dayOfWeek !== undefined && now.getUTCDay() !== task.dayOfWeek) return false;
    }
    // Don't run twice in the same minute
    if (last && now.getTime() - last.getTime() < 60_000) return false;
    return true;
  }

  const interval = SCHEDULE_INTERVALS[task.schedule];
  if (!interval) return false;
  if (!last) return true;
  return now.getTime() - last.getTime() >= interval;
}

async function runTask(task: typeof schema.scheduledTasks.$inferSelect): Promise<void> {
  await db
    .update(schema.scheduledTasks)
    .set({ lastRunAt: new Date() })
    .where(eq(schema.scheduledTasks.id, task.id));

  switch (task.type) {
    case "command":
      if (task.command) await sendCommand(task.serverId, task.command);
      break;
    case "restart":
      await sendCommand(task.serverId, "stop");
      break;
    case "stop":
      await sendCommand(task.serverId, "stop");
      break;
  }
}

export function startTaskScheduler() {
  setInterval(async () => {
    try {
      const tasks = await db
        .select()
        .from(schema.scheduledTasks)
        .where(eq(schema.scheduledTasks.enabled, true));
      for (const task of tasks) {
        if (isDue(task)) {
          console.log(`[scheduler] running task "${task.name}" (${task.type}) for server ${task.serverId}`);
          runTask(task).catch((e) => console.error("[scheduler] task error:", e));
        }
      }
    } catch (e) {
      console.error("[scheduler] poll error:", e);
    }
  }, 60_000);
}

export const scheduleRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)

  // ── List tasks ─────────────────────────────────────────────────────────
  .get("/:id/schedule", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    return db
      .select()
      .from(schema.scheduledTasks)
      .where(eq(schema.scheduledTasks.serverId, params.id));
  })

  .use(requireRole("operator"))

  // ── Create task ────────────────────────────────────────────────────────
  .post(
    "/:id/schedule",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      if (body.type === "command" && !body.command?.trim()) {
        return status(400, "Command is required for type=command");
      }
      const id = randomUUID();
      await db.insert(schema.scheduledTasks).values({
        id,
        serverId: params.id,
        name: body.name,
        type: body.type,
        command: body.command ?? null,
        schedule: body.schedule,
        timeOfDay: body.timeOfDay ?? null,
        dayOfWeek: body.dayOfWeek ?? null,
        enabled: body.enabled ?? true,
      });
      await audit({
        userId: session.user.id,
        action: "schedule.create",
        resource: "schedule",
        resourceId: id,
        metadata: { name: body.name, type: body.type, schedule: body.schedule },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      const [task] = await db.select().from(schema.scheduledTasks).where(eq(schema.scheduledTasks.id, id)).limit(1);
      return task;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        type: t.Union([t.Literal("command"), t.Literal("restart"), t.Literal("stop")]),
        command: t.Optional(t.String({ maxLength: 500 })),
        schedule: t.Union([t.Literal("hourly"), t.Literal("2h"), t.Literal("6h"), t.Literal("daily"), t.Literal("weekly")]),
        timeOfDay: t.Optional(t.String()),
        dayOfWeek: t.Optional(t.Number()),
        enabled: t.Optional(t.Boolean()),
      }),
    }
  )

  // ── Update task ────────────────────────────────────────────────────────
  .patch(
    "/:id/schedule/:taskId",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const [existing] = await db
        .select({ serverId: schema.scheduledTasks.serverId })
        .from(schema.scheduledTasks)
        .where(and(eq(schema.scheduledTasks.id, params.taskId), eq(schema.scheduledTasks.serverId, params.id)))
        .limit(1);
      if (!existing) return status(404, "Task not found");
      const update: Partial<typeof schema.scheduledTasks.$inferInsert> = {};
      if (body.name !== undefined) update.name = body.name;
      if (body.type !== undefined) update.type = body.type;
      if (body.command !== undefined) update.command = body.command;
      if (body.schedule !== undefined) update.schedule = body.schedule;
      if (body.timeOfDay !== undefined) update.timeOfDay = body.timeOfDay;
      if (body.dayOfWeek !== undefined) update.dayOfWeek = body.dayOfWeek;
      if (body.enabled !== undefined) update.enabled = body.enabled;
      await db.update(schema.scheduledTasks).set(update).where(eq(schema.scheduledTasks.id, params.taskId));
      await audit({
        userId: session.user.id,
        action: "schedule.update",
        resource: "schedule",
        resourceId: params.taskId,
        metadata: update,
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      const [task] = await db.select().from(schema.scheduledTasks).where(eq(schema.scheduledTasks.id, params.taskId)).limit(1);
      return task;
    },
    { body: t.Partial(t.Object({ name: t.String(), type: t.String(), command: t.String(), schedule: t.String(), timeOfDay: t.String(), dayOfWeek: t.Number(), enabled: t.Boolean() })) }
  )

  // ── Delete task ────────────────────────────────────────────────────────
  .delete(
    "/:id/schedule/:taskId",
    async ({ params, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const [existing] = await db
        .select({ id: schema.scheduledTasks.id })
        .from(schema.scheduledTasks)
        .where(and(eq(schema.scheduledTasks.id, params.taskId), eq(schema.scheduledTasks.serverId, params.id)))
        .limit(1);
      if (!existing) return status(404, "Task not found");
      await db.delete(schema.scheduledTasks).where(eq(schema.scheduledTasks.id, params.taskId));
      await audit({
        userId: session.user.id,
        action: "schedule.delete",
        resource: "schedule",
        resourceId: params.taskId,
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true };
    }
  )

  // ── Run now ───────────────────────────────────────────────────────────
  .post(
    "/:id/schedule/:taskId/run",
    async ({ params, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const [task] = await db
        .select()
        .from(schema.scheduledTasks)
        .where(and(eq(schema.scheduledTasks.id, params.taskId), eq(schema.scheduledTasks.serverId, params.id)))
        .limit(1);
      if (!task) return status(404, "Task not found");
      runTask(task).catch((e) => console.error("[scheduler] manual run error:", e));
      await audit({
        userId: session.user.id,
        action: "schedule.run",
        resource: "schedule",
        resourceId: params.taskId,
        metadata: { name: task.name, type: task.type },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true };
    }
  );
