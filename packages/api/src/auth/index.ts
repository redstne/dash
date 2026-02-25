import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, schema } from "../db/index.ts";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  secret: process.env["BETTER_AUTH_SECRET"] ?? (() => { throw new Error("BETTER_AUTH_SECRET not set"); })(),
  baseURL: process.env["BASE_URL"] ?? "http://localhost:3001",
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "viewer",
        input: false, // not settable via sign-up payload
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // refresh if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min client-side cache
    },
  },
  advanced: {
    // Disable Secure flag by default so HTTP (local/dev) works.
    // Set SECURE_COOKIES=true when running behind an HTTPS reverse proxy.
    useSecureCookies: process.env["SECURE_COOKIES"] === "true",
    crossSubDomainCookies: { enabled: false },
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
