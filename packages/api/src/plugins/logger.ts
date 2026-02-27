import { Elysia } from "elysia";

const timings = new WeakMap<Request, number>();

function log(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function levelFor(status: number): "info" | "warn" | "error" {
  if (status < 400) return "info";
  if (status < 500) return "warn";
  return "error";
}

const SKIP = new Set(["/api/health", "/favicon.svg", "/favicon.ico"]);

// ── Plugin ─────────────────────────────────────────────────────────────────
export const loggerPlugin = new Elysia({ name: "logger" })
  .onRequest(({ request }) => {
    timings.set(request, performance.now());
  })

  .onAfterResponse({ as: "global" }, ({ request, set }) => {
    const url = new URL(request.url);
    const path = url.pathname + (url.search || "");
    if (SKIP.has(path) || path.startsWith("/assets/")) return;

    const start = timings.get(request);
    const ms = start != null ? Math.round(performance.now() - start) : null;
    const status = (set.status as number) ?? 200;

    log({
      ts: new Date().toISOString(),
      level: levelFor(status),
      method: request.method,
      path,
      status,
      ms,
    });
  })

  .onError({ as: "global" }, ({ request, error, code, set }) => {
    const url = new URL(request.url);
    const path = url.pathname + (url.search || "");
    const start = timings.get(request);
    const ms = start != null ? Math.round(performance.now() - start) : null;
    const status = (set.status as number) ?? 500;

    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: code === "NOT_FOUND" ? "warn" : "error",
      method: request.method,
      path,
      status,
      ms,
      code,
    };

    if (error instanceof Error) {
      entry.error = error.message;
      if (error.stack) {
        entry.stack = error.stack.split("\n").slice(1, 5).map((l) => l.trim());
      }
    } else {
      entry.error = String(error);
    }

    log(entry);
  });
