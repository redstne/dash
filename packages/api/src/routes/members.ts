import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../plugins/rbac.ts";
import { db, schema } from "../db/index.ts";
import { eq } from "drizzle-orm";
import { audit } from "../lib/audit.ts";
import { auth } from "../auth/index.ts";
import { hashPassword } from "better-auth/crypto";

export const membersRoute = new Elysia({ prefix: "/api/members" })
  .use(authPlugin)
  .use(requireRole("admin"))
  // List all users
  .get("/", () =>
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
  )
  // Create a new user
  .post(
    "/",
    async ({ body, session, status, request }) => {
      // Check email uniqueness before attempting signup
      const existing = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, body.email))
        .limit(1);
      if (existing.length > 0) return status(409, "Email already in use");

      const res = await auth.api.signUpEmail({
        body: { email: body.email, password: body.password, name: body.name },
      });
      if (!res?.user?.id) return status(500, "Failed to create user");

      await db
        .update(schema.users)
        .set({ role: body.role })
        .where(eq(schema.users.id, res.user.id));

      await audit({
        userId: session?.user?.id,
        action: "member.create",
        resource: "user",
        resourceId: res.user.id,
        metadata: { email: body.email, role: body.role },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });

      return { id: res.user.id, email: body.email, name: body.name, role: body.role };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 12 }),
        role: t.Union([t.Literal("admin"), t.Literal("operator"), t.Literal("viewer")]),
      }),
    }
  )
  // Update a user's role
  .patch(
    "/:id/role",
    async ({ params, body, session, status, request }) => {
      if (params.id === session?.user?.id) return status(400, "Cannot change your own role");
      await db
        .update(schema.users)
        .set({ role: body.role })
        .where(eq(schema.users.id, params.id));
      await audit({
        userId: session?.user?.id,
        action: "member.role_change",
        resource: "user",
        resourceId: params.id,
        metadata: { newRole: body.role },
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { ok: true };
    },
    {
      body: t.Object({
        role: t.Union([t.Literal("admin"), t.Literal("operator"), t.Literal("viewer")]),
      }),
    }
  )
  // Reset a user's password (admin sets a new one)
  .post(
    "/:id/reset-password",
    async ({ params, body, session, status, request }) => {
      // Look up the user's email to call Better Auth's internal update
      const [user] = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, params.id))
        .limit(1);
      if (!user) return status(404, "User not found");

      const hashed = await hashPassword(body.password);
      await db
        .update(schema.accounts)
        .set({ password: hashed })
        .where(eq(schema.accounts.userId, params.id));

      await audit({
        userId: session?.user?.id,
        action: "member.password_reset",
        resource: "user",
        resourceId: params.id,
        ip: request.headers.get("x-forwarded-for") ?? undefined,
      });
      return { ok: true };
    },
    {
      body: t.Object({
        password: t.String({ minLength: 12 }),
      }),
    }
  )
  // Delete a user
  .delete("/:id", async ({ params, session, status, request }) => {
    if (params.id === session?.user?.id) return status(400, "Cannot delete yourself");
    await db.delete(schema.users).where(eq(schema.users.id, params.id));
    await audit({
      userId: session?.user?.id,
      action: "member.delete",
      resource: "user",
      resourceId: params.id,
      ip: request.headers.get("x-forwarded-for") ?? undefined,
    });
    return { ok: true };
  });

export const auditRoute = new Elysia({ prefix: "/api/audit" })
  .use(authPlugin)
  .use(requireRole("admin"))
  .get("/", () =>
    db.select().from(schema.auditLog).orderBy(schema.auditLog.createdAt).limit(500)
  );

