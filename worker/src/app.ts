import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { getAuth } from "./auth";
import { getDb } from "./db/client";
import { blocklist } from "./db/schema";
import { ApiError } from "./lib/api-error";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: SessionUser;
  };
};

export const createRouter = () => new Hono<AppEnv>();

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new ApiError(401, "unauthorized", "Sign in to continue.");

  const suspended = await getDb(c.env)
    .select({ reason: blocklist.reason })
    .from(blocklist)
    .where(and(eq(blocklist.type, "user"), eq(blocklist.value, session.user.id)))
    .get();
  if (suspended) throw new ApiError(403, "account_suspended", "This account has been suspended. Contact abuse@sendm8.com if you think that's a mistake.");

  c.set("user", session.user);
  await next();
});

export function isAdmin(env: Pick<Env, "ADMIN_EMAILS">, user: SessionUser): boolean {
  if (!user.emailVerified) return false;
  const admins = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

/** Must run after requireUser. Non-admins get a 404 so the admin API isn't advertised. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isAdmin(c.env, c.get("user"))) throw new ApiError(404, "not_found", "No such endpoint.");
  await next();
});

/** CSRF: state-changing API calls must come from the dashboard's own origin. */
export const requireSameOrigin = createMiddleware<AppEnv>(async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin !== new URL(c.env.APP_URL).origin) {
      throw new ApiError(403, "bad_origin", "Cross-site request blocked.");
    }
  }
  await next();
});
