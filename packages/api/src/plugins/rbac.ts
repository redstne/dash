import Elysia from "elysia";
import { auth } from "../auth/index.ts";
import { db, schema } from "../db/index.ts";
import { eq } from "drizzle-orm";

export type Role = "admin" | "operator" | "viewer";

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

/**
 * Resolves session AND fetches the user's role from the DB.
 * Better Auth's session payload doesn't include custom fields like `role`,
 * so we look it up directly to ensure we always have a fresh, accurate value.
 */
export const authPlugin = new Elysia({ name: "auth-plugin" }).derive(
  { as: "scoped" },
  async ({ request }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return { session, role: null as Role | null };

    const [row] = await db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, session.user.id))
      .limit(1);

    return { session, role: (row?.role ?? "viewer") as Role };
  }
);

/** Returns an Elysia plugin that enforces a minimum role. Mount with .use() */
export function requireRole(minRole: Role) {
  return new Elysia({ name: `rbac-${minRole}` })
    .use(authPlugin)
    .onBeforeHandle({ as: "scoped" }, ({ session, role, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      if (role === null || ROLE_RANK[role] < ROLE_RANK[minRole]) {
        return status(403, "Forbidden — insufficient role");
      }
    });
}
