import Elysia from "elysia";

/** Attaches security-hardening response headers to every request. */
export const securityHeaders = new Elysia({ name: "security-headers" }).onAfterHandle(
  { as: "global" },
  ({ set }) => {
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    set.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()";
    if (process.env["NODE_ENV"] === "production") {
      if (process.env["SECURE_COOKIES"] === "true") {
        set.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
      }
      const origin = process.env["BASE_URL"] ?? "";
      // Derive the WebSocket equivalent of the origin (http→ws, https→wss)
      const wsOrigin = origin.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
      set.headers["Content-Security-Policy"] = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "img-src 'self' data: blob: https://cdn.modrinth.com https://mc-heads.net",
        `connect-src 'self'${wsOrigin ? ` ${wsOrigin}` : ""}`,
        "font-src 'self' https://cdn.jsdelivr.net",
        "frame-src 'self'",
        "worker-src 'self' blob:",
      ].join("; ");
    }
  }
);
