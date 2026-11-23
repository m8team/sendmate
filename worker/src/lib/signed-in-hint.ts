/**
 * A tiny, readable "you're signed in" marker for the static marketing pages.
 *
 * The real session cookie is HttpOnly, so a static page can't tell whether its visitor is signed in
 * without a request. This cookie says only that (`sendm8_signed_in=1`), so the header can show
 * "Dashboard" instead of "Sign in" before it paints. It grants nothing: every dashboard request still
 * checks the real session. It follows the session cookie's lifetime, set and cleared alongside it.
 */
import { SESSION_COOKIE_PREFIX } from "../auth";

export const HINT_COOKIE = "sendm8_signed_in";

const SESSION_COOKIE_RE = new RegExp(`^(?:__Secure-)?${SESSION_COOKIE_PREFIX.replace(".", "\\.")}\\.session_token=([^;]*)`, "i");

const isSecure = (url: string) => url.startsWith("https:");

/** The marker, alive for `maxAge` seconds (or for the browser session when undefined). */
export function hintCookie(requestUrl: string, maxAge?: number): string {
  return [`${HINT_COOKIE}=1`, "Path=/", "SameSite=Lax", maxAge === undefined ? null : `Max-Age=${Math.max(0, Math.floor(maxAge))}`, isSecure(requestUrl) ? "Secure" : null]
    .filter(Boolean)
    .join("; ");
}

export function clearHintCookie(requestUrl: string): string {
  return [`${HINT_COOKIE}=`, "Path=/", "SameSite=Lax", "Max-Age=0", isSecure(requestUrl) ? "Secure" : null].filter(Boolean).join("; ");
}

export function hasHint(cookieHeader: string | null | undefined): boolean {
  return new RegExp(`(?:^|;\\s*)${HINT_COOKIE}=1(?:;|$)`).test(cookieHeader ?? "");
}

/** Whether the request carries a session cookie at all (valid or not). Cheap: no crypto, no database. */
export function hasSessionCookie(cookieHeader: string | null | undefined): boolean {
  return (cookieHeader ?? "").split(/;\s*/).some((part) => SESSION_COOKIE_RE.test(part) && !/=\s*$/.test(part));
}

/**
 * What a Set-Cookie for the session token means for the marker: "set" with its lifetime, "clear",
 * or null when the header isn't the session token.
 */
export function sessionCookieChange(setCookie: string, now = Date.now()): { action: "set"; maxAge?: number } | { action: "clear" } | null {
  const match = SESSION_COOKIE_RE.exec(setCookie);
  if (!match) return null;
  if (!match[1]) return { action: "clear" };
  const maxAge = /;\s*max-age=(-?\d+)/i.exec(setCookie);
  if (maxAge) return Number(maxAge[1]) > 0 ? { action: "set", maxAge: Number(maxAge[1]) } : { action: "clear" };
  const expires = /;\s*expires=([^;]+)/i.exec(setCookie)?.[1];
  if (expires) {
    const at = Date.parse(expires);
    if (!Number.isNaN(at)) return at > now ? { action: "set", maxAge: Math.floor((at - now) / 1000) } : { action: "clear" };
  }
  return { action: "set" };
}

/**
 * The marker Set-Cookie a response needs, if any: mirrors a session cookie the response sets or
 * clears, clears the marker on a 401, and (for /api/me) sets it for sessions that predate the marker.
 */
export function hintChange(request: Request, response: Response, sessionExpiresAt?: Date): string | null {
  const cookies = request.headers.get("cookie");
  let change: string | null = null;

  for (const header of response.headers.getSetCookie()) {
    const next = sessionCookieChange(header);
    if (next) change = next.action === "set" ? hintCookie(request.url, next.maxAge) : clearHintCookie(request.url);
  }
  if (!change && response.status === 401 && hasHint(cookies)) change = clearHintCookie(request.url);
  if (!change && sessionExpiresAt && response.ok && !hasHint(cookies)) {
    change = hintCookie(request.url, (sessionExpiresAt.getTime() - Date.now()) / 1000);
  }
  return change;
}

/** `response` with the marker Set-Cookie added when it needs one. */
export function syncHint(request: Request, response: Response, sessionExpiresAt?: Date): Response {
  const change = hintChange(request, response, sessionExpiresAt);
  if (!change) return response;

  const res = new Response(response.body, response);
  res.headers.append("set-cookie", change);
  return res;
}

/** Only dashboard paths are allowed as a post-sign-in destination; anything else falls back to /app. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/app") || next.startsWith("//") || next.includes("\\")) return "/app";
  try {
    const url = new URL(next, "https://x.invalid");
    if (url.origin !== "https://x.invalid" || url.pathname.replace(/\/+$/, "") === "/app/sign-in") return "/app";
    return url.pathname + url.search;
  } catch {
    return "/app";
  }
}
