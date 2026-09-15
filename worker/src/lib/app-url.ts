import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { instanceSettings } from "../db/schema";

const KEY = "app_url";

/**
 * APP_URL is optional so a fresh "Deploy to Cloudflare" works before anyone knows the Worker's URL.
 * When it's unset, the first URL the Worker is visited on becomes its URL and is saved, so cron jobs
 * (digests, retries) can build links too. Set APP_URL explicitly once you add a custom domain.
 *
 * The resolved value is written onto `env`, which is reused for the life of the isolate, so every
 * existing `env.APP_URL` reader sees it.
 */
export async function ensureAppUrl(env: Env, request?: Request, ctx?: Pick<ExecutionContext, "waitUntil">): Promise<void> {
  if (env.APP_URL) return;

  const db = getDb(env);
  const stored = await db.select({ value: instanceSettings.value }).from(instanceSettings).where(eq(instanceSettings.key, KEY)).get();
  if (stored) {
    env.APP_URL = stored.value;
    return;
  }
  if (!request) return;

  const origin = new URL(request.url).origin;
  env.APP_URL = origin;
  const save = db.insert(instanceSettings).values({ key: KEY, value: origin, updatedAt: Date.now() }).onConflictDoNothing();
  if (ctx) ctx.waitUntil(save.then(() => undefined));
  else await save;
}

/** Sender for system emails. Falls back to notify@<APP_URL host> when EMAIL_FROM isn't set. */
export function emailFrom(env: Pick<Env, "EMAIL_FROM" | "APP_URL">): string {
  if (env.EMAIL_FROM) return env.EMAIL_FROM;
  try {
    return `sendm8 <notify@${new URL(env.APP_URL).hostname}>`;
  } catch {
    return "sendm8 <notify@localhost>";
  }
}
