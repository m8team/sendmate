import type { Context } from "hono";
import type { AppEnv } from "../app";
import { getAuth } from "../auth";
import { clearHintCookie, hasHint, hasSessionCookie, safeNext } from "../lib/signed-in-hint";

/**
 * /app/sign-in, routed through the Worker so a signed-in visitor goes straight to the dashboard
 * instead of seeing the sign-in page first. Signed-out visitors (no session cookie at all) get the
 * static page with no extra work; only a visitor with a session cookie costs a session check, and
 * that's usually answered from the signed cookie cache without touching the database.
 */
const PAGE = "/app/sign-in/";

/** Mounted on both /app/sign-in and /app/sign-in/ (see index.ts). */
export async function signInPage(c: Context<AppEnv>): Promise<Response> {
  const cookies = c.req.header("cookie");
  if (hasSessionCookie(cookies)) {
    const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    if (session) {
      return new Response(null, { status: 302, headers: { location: safeNext(c.req.query("next")), "cache-control": "no-store" } });
    }
  }
  const asset = c.env.ASSETS ? await c.env.ASSETS.fetch(new URL(PAGE, c.req.url)) : null;
  const res = asset ? new Response(asset.body, asset) : new Response("Not found", { status: 404 });
  res.headers.set("cache-control", "no-cache");
  // A marker without a working session is stale: drop it so the header stops saying "Dashboard".
  if (hasHint(cookies)) res.headers.append("set-cookie", clearHintCookie(c.req.url));
  return res;
}
