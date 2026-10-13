import { SECURITY_HEADERS } from "@sendm8/shared";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../app";

/**
 * Adds SECURITY_HEADERS to a response, keeping any a route set itself (file downloads have their own
 * sandboxing Content-Security-Policy). Responses passed straight through from fetch() have immutable
 * headers, so those are copied first.
 */
export function withSecurityHeaders(response: Response): Response {
  const missing = Object.entries(SECURITY_HEADERS).filter(([name]) => !response.headers.has(name));
  if (missing.length === 0) return response;
  try {
    for (const [name, value] of missing) response.headers.set(name, value);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    for (const [name, value] of missing) copy.headers.set(name, value);
    return copy;
  }
}

export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  await next();
  // Reassigning c.res makes Hono rebuild the response, so only do it when a copy was needed.
  const res = withSecurityHeaders(c.res);
  if (res !== c.res) c.res = res;
});
