# Copilot Instructions — redstnkit/dash

Minecraft server management dashboard. Bun monorepo with an Elysia API backend and a React + Vite frontend, served as a single Docker image.

## Commands

```bash
# Run everything (API on :3001, Vite dev server on :5173)
bun run dev

# Individual packages
cd packages/api && bun run dev        # watch mode, hot reload
cd packages/web && bun run dev        # Vite dev server

# Type-check (no emitting — this is the "lint")
cd packages/api && bun run tsc --noEmit
cd packages/web && bun run tsc --noEmit

# Database
cd packages/api && bun run db:generate   # regenerate drizzle migration files
cd packages/api && bun run db:migrate    # apply migrations (also runs on container start)

# Docker (production)
docker compose up -d
docker compose build dashboard          # rebuild image after code changes
```

There are no automated tests. `tsc --noEmit` is the validation step.

## Architecture

```
packages/
  api/          Elysia.js server — serves both the REST API (/api/*) and the built React SPA
  web/          React 19 + Vite — builds to packages/api/public/
```

**Request flow in production:** Browser → port 3001 → Elysia → `/api/*` routes or static `public/` fallback.

**In development:** Vite dev server (`:5173`) proxies `/api` to `:3001`. Both must be running.

**Container startup sequence:** `bun run src/db/migrate.ts` (migrations + admin seed + server seed) → `bun run src/index.ts`.

## API Conventions

### Route files
Each feature is an `Elysia` instance exported and `.use()`'d in `src/index.ts`. Auth check pattern used everywhere:

```ts
if (!session?.user) return status(401, "Unauthorized");
```

### Role guard
Apply `requireRole` as a plugin *before* route definitions in the same chain:

```ts
new Elysia({ prefix: "/api/servers" })
  .use(authPlugin)
  .use(requireRole("operator"))   // "viewer" | "operator" | "admin"
  .get(...)
```

Roles rank: `viewer` < `operator` < `admin`. `authPlugin` populates `ctx.session` and `ctx.role` (fetched fresh from DB, not from session token).

### RCON
Never create `Rcon` instances directly. Always go through `sendCommand(serverId, cmd)` from `src/lib/rcon.ts`. It handles the connection pool, idle eviction (5 min), stale-connection retry, and the 10-second `getServerStatus` cache.

### Encrypted secrets
RCON passwords are stored as AES-256-GCM blobs in the DB. Use `encrypt()` / `decrypt()` from `src/lib/crypto.ts`. The `ENCRYPTION_KEY` env var must be the same across restarts or decryption will fail with `OperationError`.

When reading `Buffer` from SQLite and passing to `crypto.subtle`, always slice correctly:
```ts
buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
```

### Audit logging
Call `audit({ userId, action, resource, resourceId, metadata?, ip? })` for all mutating actions. Actions follow the pattern `"resource.verb"` e.g. `"server.stop"`, `"player.ban"`.

### Server properties
`derivePropertiesPath(logPath)` derives the `server.properties` path from the server's `logPath` (`/data/mc/logs/latest.log` → `/data/mc/server.properties`). The MC volume is mounted read-write at `/data/mc`.

## Frontend Conventions

### Routing
File-based via TanStack Router. **Never edit `routeTree.gen.ts` manually** — it is regenerated automatically by the Vite plugin on `bun run dev`. Add routes by creating files under `src/routes/`.

Route structure:
- `_app.tsx` — protected layout (redirects to `/login` if no session)
- `_app/servers/$id/` — per-server pages (console, players, settings, etc.)

### Data fetching
Use `useQuery` / `useMutation` from TanStack Query. Always pass `credentials: "include"` to `fetch`. Query keys follow `["resource", id?]`.

### UI components
All shadcn components live in `src/components/ui/`. When adding a new one, copy from `figma/src/app/components/ui/`, then:
1. Replace `from "./utils"` → `from "@/lib/utils.ts"`
2. Replace `from "./component-name"` → `from "@/components/ui/component-name.tsx"`
3. Remove `"use client";` directives
4. Fix `import { SomeType }` → `import { type SomeType }` if `verbatimModuleSyntax` errors appear

The `cn()` helper is in `@/lib/utils.ts`. Always use it for conditional Tailwind classes.

### Console page
The terminal must be a direct flex child with `flex-1 min-h-0` — no Card wrapper — so xterm fills available height. The parent `<main>` uses `overflow-hidden` for console routes.

## Database

Drizzle ORM with `bun:sqlite`. Schema is in `packages/api/src/db/schema.ts`. Migrations are in `packages/api/drizzle/`. When adding a column:
1. Add to schema
2. Run `bun run db:generate`
3. Verify the new entry in `drizzle/meta/_journal.json` has a `when` timestamp **greater** than all previous entries (Drizzle uses this for ordering — if it's less, the migration will be silently skipped).

## Environment Variables

Required secrets (never committed):
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
- `ENCRYPTION_KEY` — `openssl rand -hex 32` (32 bytes = 64 hex chars, **must be stable across restarts**)

Minecraft server auto-seed (upserted by `name` on every startup):
- `MC_SERVERS` — JSON array, or
- `MC_SERVER_1_NAME` / `MC_SERVER_1_HOST` / `MC_SERVER_1_PORT` / `MC_SERVER_1_PASSWORD` (up to `_9_`)
- `MC_LOG_PATH` — applied to the single seeded server if it has no `logPath` yet

See `.env.example` for all defaults.

## Docker

Multi-stage build: `web-builder` compiles React into `packages/api/public/`, then `runner` (Alpine) serves everything from port 3001. Published to `ghcr.io/redstnkit/dash:latest` via GitHub Actions on push to `main`.

The `minecraft_data` named volume is shared between the Minecraft container (`/data`) and the dashboard (`/data/mc`) for log tailing and `server.properties` editing.
