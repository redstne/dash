import Elysia from "elysia";

/** Attaches security-hardening response headers to every request. */
export const securityHeaders = new Elysia({ name: "security-headers" }).onAfterHandle(
  { as: "global" },
  ({ response }) => {
    if (response instanceof Response) {
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("X-Frame-Options", "DENY");
      response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
      if (process.env["NODE_ENV"] === "production") {
        if (process.env["SECURE_COOKIES"] === "true") {
          response.headers.set(
            "Strict-Transport-Security",
            "max-age=63072000; includeSubDomains; preload"
          );
        }
        // Restrict WebSocket connect-src to same origin only
        const origin = process.env["BASE_URL"] ?? "";
        const wsOrigin = origin.replace(/^https?/, "wss").replace(/^http/, "ws");
        response.headers.set(
          "Content-Security-Policy",
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            `connect-src 'self' ${wsOrigin}`,
            "font-src 'self'",
            "frame-src 'self'",
          ].join("; ")
        );
      }
    }
  }
);
