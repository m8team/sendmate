import { eq } from "drizzle-orm";
import { z } from "zod";
import { createRouter } from "../app";
import { getDb } from "../db/client";
import { session, user } from "../db/schema";
import { ApiError, readJson } from "../lib/api-error";
import { randomToken } from "../lib/secrets";
import { SESSION_COOKIE_PREFIX } from "../auth";

/**
 * Local-only sign-in, so the dashboard can be developed without real GitHub/Google OAuth apps.
 * Enabled only when DEV_LOGIN is "true" and both APP_URL and the request are localhost http, so a stray
 * production var can't open it up.
 */
export const devRoutes = createRouter();

const isLocal = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
};

/** Both the configured APP_URL and the actual request must be local, so no production misconfiguration can enable it. */
export function devLoginEnabled(env: Pick<Env, "APP_URL"> & { DEV_LOGIN?: string }, requestUrl: string): boolean {
  return env.DEV_LOGIN === "true" && isLocal(env.APP_URL) && isLocal(requestUrl);
}

async function signCookieValue(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...signature))}`);
}

devRoutes.post("/login", async (c) => {
  if (!devLoginEnabled(c.env, c.req.url)) throw new ApiError(404, "not_found", "No such endpoint.");
  const input = await readJson(c.req.raw, z.object({ email: z.email().default("dev@sendm8.local"), name: z.string().max(100).default("Dev Mate") }));

  const db = getDb(c.env);
  const email = input.email.toLowerCase();
  const now = new Date();
  const image = `https://i.pravatar.cc/150?u=${email}`;
  let account = await db.select().from(user).where(eq(user.email, email)).get();
  if (!account) {
    account = await db
      .insert(user)
      .values({ id: crypto.randomUUID(), name: input.name, email, image, emailVerified: true, createdAt: now, updatedAt: now })
      .returning()
      .get();
  } else if (!account.image) {
    account = await db.update(user).set({ image, updatedAt: now }).where(eq(user.id, account.id)).returning().get();
  }

  const token = randomToken(24);
  await db.insert(session).values({
    id: crypto.randomUUID(),
    token,
    userId: account.id,
    expiresAt: new Date(now.getTime() + 7 * 86_400_000),
    createdAt: now,
    updatedAt: now,
  });

  c.header("set-cookie", `${SESSION_COOKIE_PREFIX}.session_token=${await signCookieValue(c.env.BETTER_AUTH_SECRET, token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  return c.json({ data: { userId: account.id, email } });
});
