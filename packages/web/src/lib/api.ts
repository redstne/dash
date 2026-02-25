/**
 * Type-safe API client powered by Elysia Eden Treaty.
 * The App type is imported from the API package via TypeScript project references.
 * At runtime, calls go through the Vite proxy (dev) or same origin (prod).
 *
 * NOTE: Import the App type via a type-only import that your tsconfig resolves.
 * For now we use `any` and rely on the proxy — swap to full Eden types by
 * adding a TypeScript project reference to packages/api in tsconfig.json.
 */

const BASE = import.meta.env["VITE_API_URL"] ?? "";

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  fetch: apiFetch,
};
