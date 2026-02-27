import Elysia, { t } from "elysia";
import { authPlugin, requireRole } from "../../plugins/rbac.ts";
import { readdir, readFile, writeFile, rm, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { db, schema } from "../../db/index.ts";
import { eq } from "drizzle-orm";
import { audit } from "../../lib/audit.ts";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB read/write limit
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 MB upload limit

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

/** Derive server data root from logPath (/data/mc/logs/latest.log → /data/mc). */
function deriveServerRoot(logPath: string): string {
  const parts = logPath.split("/");
  const logsIdx = parts.lastIndexOf("logs");
  if (logsIdx === -1) throw new Error("Cannot derive server root from logPath");
  return parts.slice(0, logsIdx).join("/") || "/";
}

async function resolveServerRoot(serverId: string): Promise<string> {
  if (!SAFE_ID.test(serverId)) throw new Error("Invalid server ID");
  const [server] = await db
    .select({ logPath: schema.servers.logPath })
    .from(schema.servers)
    .where(eq(schema.servers.id, serverId))
    .limit(1);
  if (!server) throw new Error("Server not found");
  if (server.logPath) return deriveServerRoot(server.logPath);
  throw new Error("logPath not configured — set the Log Path in Server Settings → Integrations");
}

function safePath(root: string, requested: string): string {
  const resolved = path.resolve(root, requested.replace(/^\/+/, ""));
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

export const filesRoute = new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  .use(requireRole("operator"))
  // List directory entries with stat info
  .get(
    "/:id/files",
    async ({ params, query, status }) => {
      try {
        const root = await resolveServerRoot(params.id);
        const target = safePath(root, query.path ?? "/");
        const entries = await readdir(target, { withFileTypes: true });
        const result = await Promise.all(
          entries.map(async (e) => {
            const fullPath = path.join(target, e.name);
            const relativePath = path.join(query.path ?? "/", e.name);
            try {
              const info = await stat(fullPath);
              return {
                name: e.name,
                type: e.isDirectory() ? "directory" : "file",
                path: relativePath,
                size: e.isDirectory() ? null : info.size,
                modifiedAt: info.mtime.toISOString(),
              };
            } catch {
              return { name: e.name, type: e.isDirectory() ? "directory" : "file", path: relativePath, size: null, modifiedAt: null };
            }
          })
        );
        return result;
      } catch (e) {
        return status(400, String(e));
      }
    },
    { query: t.Object({ path: t.Optional(t.String()) }) }
  )
  // Read file content
  .get(
    "/:id/files/content",
    async ({ params, query, status }) => {
      try {
        const root = await resolveServerRoot(params.id);
        const target = safePath(root, query.path);
        const info = await stat(target);
        if (info.isDirectory()) return status(400, "Path is a directory");
        if (info.size > MAX_FILE_SIZE) return status(413, "File too large (max 2 MB)");
        const content = await readFile(target, "utf8");
        return { content, size: info.size };
      } catch (e) {
        return status(400, String(e));
      }
    },
    { query: t.Object({ path: t.String() }) }
  )
  // Write (save) file content
  .put(
    "/:id/files/content",
    async ({ params, query, body, session, status, request }) => {
      if (!session?.user) return status(401, "Unauthorized");
      try {
        const root = await resolveServerRoot(params.id);
        const target = safePath(root, query.path);
        if (Buffer.byteLength(body.content, "utf8") > MAX_FILE_SIZE)
          return status(413, "Content too large (max 2 MB)");
        await writeFile(target, body.content, "utf8");
        await audit({
          userId: session.user.id,
          action: "file.write",
          resource: "server",
          resourceId: params.id,
          metadata: { path: query.path },
          ip: request.headers.get("x-forwarded-for") ?? undefined,
        });
        return { ok: true };
      } catch (e) {
        return status(400, String(e));
      }
    },
    {
      query: t.Object({ path: t.String() }),
      body: t.Object({ content: t.String() }),
    }
  )
  // Create directory
  .post(
    "/:id/files/mkdir",
    async ({ params, query, session, status }) => {
      if (!session?.user) return status(401, "Unauthorized");
      try {
        const root = await resolveServerRoot(params.id);
        const target = safePath(root, query.path);
        await mkdir(target, { recursive: true });
        return { ok: true };
      } catch (e) {
        return status(400, String(e));
      }
    },
    { query: t.Object({ path: t.String() }) }
  )
  // Delete file or empty directory
  .delete(
    "/:id/files",
    async ({ params, query, session, status, request }) => {
      if (!session?.user) return status(401, "Unauthorized");
      try {
        const root = await resolveServerRoot(params.id);
        const target = safePath(root, query.path);
        const info = await stat(target);
        await rm(target, { recursive: info.isDirectory(), force: false });
        await audit({
          userId: session.user.id,
          action: "file.delete",
          resource: "server",
          resourceId: params.id,
          metadata: { path: query.path },
          ip: request.headers.get("x-forwarded-for") ?? undefined,
        });
        return { ok: true };
      } catch (e) {
        return status(400, String(e));
      }
    },
    { query: t.Object({ path: t.String() }) }
  )
  // Upload one or more files into a directory
  .post(
    "/:id/files/upload",
    async ({ params, query, body, session, status, request }) => {
      if (!session?.user) return status(401, "Unauthorized");
      try {
        const root = await resolveServerRoot(params.id);
        const targetDir = safePath(root, query.path ?? "/");
        const info = await stat(targetDir);
        if (!info.isDirectory()) return status(400, "Target must be a directory");

        const files: File[] = Array.isArray(body.files) ? body.files : [body.files];
        const saved: string[] = [];

        for (const file of files) {
          if (file.size > MAX_UPLOAD_SIZE) return status(413, `${file.name} exceeds 100 MB limit`);
          // Sanitise filename — strip path separators
          const safeName = path.basename(file.name).replace(/[^\w.\-+()[\] ]/g, "_");
          const dest = path.join(targetDir, safeName);
          // safePath check on the destination
          safePath(root, path.relative(root, dest));
          const arrayBuf = await file.arrayBuffer();
          await writeFile(dest, Buffer.from(arrayBuf));
          saved.push(safeName);
        }

        await audit({
          userId: session.user.id,
          action: "file.upload",
          resource: "server",
          resourceId: params.id,
          metadata: { path: query.path, files: saved },
          ip: request.headers.get("x-forwarded-for") ?? undefined,
        });
        return { ok: true, saved };
      } catch (e) {
        return status(400, String(e));
      }
    },
    {
      query: t.Object({ path: t.Optional(t.String()) }),
      body: t.Object({ files: t.Union([t.File(), t.Array(t.File())]) }),
      type: "multipart/form-data",
    }
  );

