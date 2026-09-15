import { z } from "zod";
import { createRouter } from "../app";
import { hashIp } from "../lib/crypto";
import { clientIp } from "../lib/http";
import { browserSummary, recordError, scrubPath } from "../ops/errors";

/**
 * POST /api/errors: crash reports from the site and dashboard (web/src/lib/error-reporter.ts).
 * Public, because pages break for signed-out visitors too, so it's same-origin only, rate limited,
 * size capped and filtered for browser noise. It always answers 204 so reporting never retries.
 */
export const clientErrorRoutes = createRouter();

const MAX_BODY_BYTES = 16 * 1024;

const reportSchema = z.object({
  name: z.string().max(200).optional(),
  message: z.string().max(2_000),
  stack: z.string().max(8_000).optional(),
  page: z.string().max(1_000).optional(),
  /** "error" | "unhandledrejection" | "vue" */
  kind: z.string().max(40).optional(),
  component: z.string().max(200).optional(),
  info: z.string().max(200).optional(),
});

/** Errors we can't act on: cross-origin scripts, extensions, and a harmless Chrome warning. */
export function isBrowserNoise(report: { message: string; stack?: string }): boolean {
  if (!report.message.trim() || /^Script error\.?$/i.test(report.message.trim())) return true;
  if (/ResizeObserver loop/i.test(report.message)) return true;
  return /(chrome|moz|safari(-web)?)-extension:\/\//i.test(`${report.message}\n${report.stack ?? ""}`);
}

clientErrorRoutes.post("/", async (c) => {
  const env = c.env;
  if (c.req.header("origin") !== new URL(env.APP_URL).origin) {
    return c.json({ error: { code: "bad_origin", message: "Cross-site request blocked." } }, 403);
  }
  if (Number(c.req.header("content-length") ?? 0) > MAX_BODY_BYTES) return c.body(null, 413);

  const ipHash = await hashIp(env.IP_HASH_SECRET, clientIp(c.req.raw));
  const limited = await env.RL_PUBLIC_ACTIONS?.limit({ key: `errors:${ipHash ?? "unknown"}` });
  if (limited?.success === false) return c.body(null, 429);

  const text = await c.req.text();
  if (text.length > MAX_BODY_BYTES) return c.body(null, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return c.body(null, 400);
  }
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return c.body(null, 400);
  const report = parsed.data;
  if (isBrowserNoise(report)) return c.body(null, 204);

  c.executionCtx.waitUntil(
    recordError(env, {
      source: "browser",
      name: report.name || "Error",
      message: report.message,
      stack: report.stack ?? null,
      context: {
        page: scrubPath(report.page),
        browser: browserSummary(c.req.header("user-agent")),
        kind: report.kind,
        component: report.component,
        info: report.info,
      },
    }),
  );
  return c.body(null, 204);
});
