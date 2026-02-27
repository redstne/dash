import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../plugins/rbac.ts";
import { db, schema } from "../db/index.ts";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { audit } from "../lib/audit.ts";

export type WebhookEvent =
  | "alert.critical"
  | "alert.warning"
  | "server.offline"
  | "server.online"
  | "player.join"
  | "player.leave"
  | "player.kick"
  | "player.ban"
  | "backup.failed"
  | "backup.success";

export const ALL_EVENTS: WebhookEvent[] = [
  "alert.critical", "alert.warning", "server.offline", "server.online",
  "player.join", "player.leave", "player.kick", "player.ban",
  "backup.failed", "backup.success",
];

export async function fireWebhooks(serverId: string, event: WebhookEvent, payload: object): Promise<void> {
  const hooks = await db
    .select()
    .from(schema.webhooks)
    .where(eq(schema.webhooks.serverId, serverId));

  for (const hook of hooks) {
    if (!hook.enabled) continue;
    let events: string[] = [];
    try { events = JSON.parse(hook.events); } catch { continue; }
    if (!events.includes(event)) continue;

    const body = JSON.stringify({
      embeds: [{
        title: `[${event}] ${serverId}`,
        description: JSON.stringify(payload, null, 2).slice(0, 4000),
        color: event.startsWith("alert.critical") || event === "server.offline" ? 0xef4444
              : event.startsWith("alert.warning") ? 0xf97316
              : event.startsWith("player.ban") || event.startsWith("player.kick") ? 0xeab308
              : event.startsWith("backup.failed") ? 0xef4444
              : 0x22c55e,
        timestamp: new Date().toISOString(),
        footer: { text: "redstnkit/dash" },
      }],
    });

    fetch(hook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch((e) => console.error(`[webhook] failed to send to ${hook.name}:`, e));
  }
}

export const webhooksRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)

  // ── List webhooks ──────────────────────────────────────────────────────
  .get("/:id/webhooks", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const hooks = await db
      .select()
      .from(schema.webhooks)
      .where(eq(schema.webhooks.serverId, params.id));
    return hooks.map((h) => ({ ...h, events: JSON.parse(h.events) as string[] }));
  })

  .use(requireRole("operator"))

  // ── Create webhook ─────────────────────────────────────────────────────
  .post(
    "/:id/webhooks",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const id = randomUUID();
      await db.insert(schema.webhooks).values({
        id,
        serverId: params.id,
        name: body.name,
        url: body.url,
        events: JSON.stringify(body.events),
        enabled: body.enabled ?? true,
      });
      await audit({
        userId: session.user.id,
        action: "webhook.create",
        resource: "webhook",
        resourceId: id,
        metadata: { name: body.name, events: body.events },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      const [hook] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, id)).limit(1);
      return { ...hook!, events: JSON.parse(hook!.events) as string[] };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        url: t.String({ minLength: 1 }),
        events: t.Array(t.String()),
        enabled: t.Optional(t.Boolean()),
      }),
    }
  )

  // ── Update webhook ─────────────────────────────────────────────────────
  .patch(
    "/:id/webhooks/:hookId",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const [existing] = await db
        .select({ id: schema.webhooks.id })
        .from(schema.webhooks)
        .where(and(eq(schema.webhooks.id, params.hookId), eq(schema.webhooks.serverId, params.id)))
        .limit(1);
      if (!existing) return status(404, "Webhook not found");
      const update: Partial<typeof schema.webhooks.$inferInsert> = {};
      if (body.name !== undefined) update.name = body.name;
      if (body.url !== undefined) update.url = body.url;
      if (body.events !== undefined) update.events = JSON.stringify(body.events);
      if (body.enabled !== undefined) update.enabled = body.enabled;
      await db.update(schema.webhooks).set(update).where(eq(schema.webhooks.id, params.hookId));
      const [hook] = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, params.hookId)).limit(1);
      return { ...hook!, events: JSON.parse(hook!.events) as string[] };
    },
    { body: t.Partial(t.Object({ name: t.String(), url: t.String(), events: t.Array(t.String()), enabled: t.Boolean() })) }
  )

  // ── Delete webhook ─────────────────────────────────────────────────────
  .delete(
    "/:id/webhooks/:hookId",
    async ({ params, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const [existing] = await db
        .select({ id: schema.webhooks.id })
        .from(schema.webhooks)
        .where(and(eq(schema.webhooks.id, params.hookId), eq(schema.webhooks.serverId, params.id)))
        .limit(1);
      if (!existing) return status(404, "Webhook not found");
      await db.delete(schema.webhooks).where(eq(schema.webhooks.id, params.hookId));
      await audit({
        userId: session.user.id,
        action: "webhook.delete",
        resource: "webhook",
        resourceId: params.hookId,
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true };
    }
  )

  // ── Test webhook ───────────────────────────────────────────────────────
  .post(
    "/:id/webhooks/:hookId/test",
    async ({ params, session, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const [hook] = await db
        .select()
        .from(schema.webhooks)
        .where(and(eq(schema.webhooks.id, params.hookId), eq(schema.webhooks.serverId, params.id)))
        .limit(1);
      if (!hook) return status(404, "Webhook not found");
      const res = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "🔔 Test webhook from redstnkit/dash",
            description: `Webhook **${hook.name}** is working correctly.`,
            color: 0x22c55e,
            timestamp: new Date().toISOString(),
            footer: { text: "redstnkit/dash" },
          }],
        }),
      });
      return { success: res.ok, status: res.status };
    }
  );
