import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../plugins/rbac.ts";
import { db, schema } from "../db/index.ts";
import { eq } from "drizzle-orm";
import { audit } from "../lib/audit.ts";
import { sendCommand } from "../lib/rcon.ts";

const PLAYER_NAME_RE = /^[a-zA-Z0-9_]{1,16}$/;

/** Parse `whitelist list` RCON output into a player name array. */
function parseWhitelistOutput(output: string): string[] {
  // "There are N whitelisted players: name1, name2"
  const match = output.match(/:\s*(.+)$/);
  if (!match) return [];
  return match[1]!.split(",").map((s) => s.trim()).filter(Boolean);
}

export const whitelistRoute = new Elysia({ prefix: "/api/servers/:id/whitelist" })
  .use(authPlugin)

  // ── Get whitelist status + player list ─────────────────────────────────
  .get("/", async ({ params, session, status }) => {
    if (!session?.user) return status(401, "Unauthorized");
    const [server] = await db
      .select({ id: schema.servers.id })
      .from(schema.servers)
      .where(eq(schema.servers.id, params.id))
      .limit(1);
    if (!server) return status(404, "Server not found");
    try {
      const [listOut, statusOut] = await Promise.all([
        sendCommand(params.id, "whitelist list"),
        sendCommand(params.id, "whitelist query"),
      ]);
      const players = parseWhitelistOutput(listOut);
      const enabled = !statusOut.toLowerCase().includes("off");
      return { enabled, players };
    } catch {
      return status(502, "Could not reach server via RCON");
    }
  })

  .use(requireRole("operator"))

  // ── Add player ────────────────────────────────────────────────────────
  .post(
    "/",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      if (!PLAYER_NAME_RE.test(body.player)) return status(400, "Invalid player name");
      const output = await sendCommand(params.id, `whitelist add ${body.player}`);
      await audit({
        userId: session.user.id,
        action: "whitelist.add",
        resource: "whitelist",
        resourceId: params.id,
        metadata: { player: body.player },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true, output };
    },
    { body: t.Object({ player: t.String() }) }
  )

  // ── Remove player ─────────────────────────────────────────────────────
  .delete(
    "/:player",
    async ({ params, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      if (!PLAYER_NAME_RE.test(params.player)) return status(400, "Invalid player name");
      const output = await sendCommand(params.id, `whitelist remove ${params.player}`);
      await audit({
        userId: session.user.id,
        action: "whitelist.remove",
        resource: "whitelist",
        resourceId: params.id,
        metadata: { player: params.player },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true, output };
    }
  )

  // ── Toggle whitelist on/off ───────────────────────────────────────────
  .post(
    "/toggle",
    async ({ params, body, session, request, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      const cmd = body.enabled ? "whitelist on" : "whitelist off";
      const output = await sendCommand(params.id, cmd);
      await audit({
        userId: session.user.id,
        action: body.enabled ? "whitelist.enable" : "whitelist.disable",
        resource: "whitelist",
        resourceId: params.id,
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { success: true, enabled: body.enabled, output };
    },
    { body: t.Object({ enabled: t.Boolean() }) }
  );
