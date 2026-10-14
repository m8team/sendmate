import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db/client";
import { account, session, user, verification } from "./db/schema";
import { alertSignup } from "./ops/events";

export const SESSION_COOKIE_PREFIX = "sendm8";

function createAuth(env: Env) {
  const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }

  return betterAuth({
    appName: "sendm8",
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(getDb(env), { provider: "sqlite", schema: { user, session, account, verification } }),
    // OAuth only: no password hashing (10ms CPU budget) and no magic links (email budget).
    socialProviders,
    account: {
      accountLinking: { enabled: true, trustedProviders: ["github", "google"] },
    },
    session: {
      // Signed cookie cache avoids a D1 read on most dashboard requests.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => alertSignup(env, created),
        },
      },
      // Zero-signup forms are claimed by GET /api/me, which the dashboard calls straight after
      // sign-in and which can deliver their waiting messages in the background.
    },
    advanced: {
      cookiePrefix: SESSION_COOKIE_PREFIX,
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

// Env is stable per isolate, so build the auth instance once and reuse it.
const instances = new WeakMap<Env, Auth>();

export function getAuth(env: Env): Auth {
  let auth = instances.get(env);
  if (!auth) {
    auth = createAuth(env);
    instances.set(env, auth);
  }
  return auth;
}
