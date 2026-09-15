import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { getDb } from "../src/db/client";
import { channels, emailAddresses, forms, submissions, user } from "../src/db/schema";
import { newFormId, newId } from "../src/lib/ids";
import { encryptJson } from "../src/lib/secrets";

export const db = () => getDb(env);

export async function createUser(overrides: Partial<typeof user.$inferInsert> = {}) {
  const id = overrides.id ?? `user_${crypto.randomUUID()}`;
  const row = {
    id,
    name: "Test Mate",
    email: `${id}@example.com`,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await db().insert(user).values(row);
  return row;
}

export async function createForm(overrides: Partial<typeof forms.$inferInsert> = {}) {
  const owner = overrides.userId === undefined ? await createUser() : null;
  const row: typeof forms.$inferInsert = {
    id: newFormId(),
    userId: owner?.id ?? overrides.userId ?? null,
    name: "Contact",
    createdAt: Date.now(),
    ...overrides,
  };
  await db().insert(forms).values(row);
  return row as typeof forms.$inferSelect;
}

export function listSubmissions(formId: string) {
  return db().select().from(submissions).where(eq(submissions.formId, formId)).all();
}

type Body = Record<string, string | string[]>;

export function postForm(formId: string, body: Body, headers: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  return SELF.fetch(`https://sendm8.test/f/${formId}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": randomIp(), ...headers },
    body: params,
  });
}

export function postJson(formId: string, body: unknown, headers: Record<string, string> = {}) {
  return SELF.fetch(`https://sendm8.test/f/${formId}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", accept: "application/json", "cf-connecting-ip": randomIp(), ...headers },
    body: JSON.stringify(body),
  });
}

export function randomIp() {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `10.${bytes[0]}.${bytes[1]}.${bytes[2]}`;
}

/** Creates a real Better Auth session and returns headers for authenticated same-origin API calls. */
export async function signIn(userId?: string) {
  const owner = userId ? { id: userId } : await createUser();
  const token = crypto.randomUUID().replaceAll("-", "");
  await env.DB.prepare("INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), token, owner.id, Date.now() + 86_400_000, Date.now(), Date.now())
    .run();

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.BETTER_AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)))));
  const cookie = `__Secure-sendm8.session_token=${encodeURIComponent(`${token}.${signature}`)}`;

  return { userId: owner.id, headers: { cookie, origin: "https://sendm8.test" } };
}

export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T; res: Response }> {
  const res = await SELF.fetch(`https://sendm8.test/api${path}`, {
    method: init.method ?? "GET",
    headers: { ...(init.body !== undefined && { "content-type": "application/json" }), ...init.headers },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON (CSV) bodies stay as text
  }
  return { status: res.status, body: body as T, res };
}

// ── Email helpers ───────────────────────────────────────────────────────────

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: any;
  rawBody?: string;
}

/**
 * Intercepts calls to the Resend API (the worker runs in the test isolate, so a global
 * fetch spy applies to it). `respond` can return a custom Response per request.
 */
export function mockResend(respond?: (req: CapturedRequest) => Response | undefined) {
  return mockFetch(respond);
}

/** Sensible default responses per host, so tests only override what they care about. */
function defaultResponse(req: CapturedRequest): Response {
  const url = new URL(req.url);
  if (url.hostname === "api.resend.com") return Response.json({ id: crypto.randomUUID() });
  if (url.hostname === "api.telegram.org") return Response.json({ ok: true, result: { id: 1, title: "Leads" } });
  if (url.hostname.endsWith("discord.com") && req.method === "GET") return Response.json({ name: "form-alerts" });
  if (url.hostname === "challenges.cloudflare.com") return Response.json({ success: true, action: "", hostname: "sendm8.test" });
  return new Response(null, { status: 204 });
}

/** Intercepts every outbound fetch. `respond` may return undefined to fall back to the defaults. */
export function mockFetch(respond?: (req: CapturedRequest) => Response | Promise<Response> | undefined) {
  const requests: CapturedRequest[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    const text = await request.text();
    let body: unknown = text || null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text
    }
    const captured = { url: request.url, method: request.method, headers: request.headers, body, rawBody: text };
    requests.push(captured);
    return (await respond?.(captured)) ?? defaultResponse(captured);
  });
  return {
    requests,
    to: (host: string) => requests.filter((r) => new URL(r.url).hostname === host),
    emails: () => requests.filter((r) => r.url === "https://api.resend.com/emails").map((r) => r.body),
  };
}

export const DISCORD_URL = `https://discord.com/api/webhooks/123456789012345678/${"a".repeat(68)}`;
// Built in pieces so secret scanners (and GitHub push protection) don't mistake this fake for a real webhook.
export const SLACK_URL = ["https://hooks.slack.com/services", "T0000000", "B0000000", "X".repeat(24)].join("/");
export const TELEGRAM_TOKEN = `123456789:${"A".repeat(35)}`;

export async function addChannel(formId: string, type: "discord" | "slack" | "telegram" | "webhook", config: unknown, label = type) {
  const row = { id: newId(), formId, type, configEnc: await encryptJson(env, config), label, createdAt: Date.now() };
  await db().insert(channels).values(row);
  return row;
}

export async function addAddress(userId: string, email: string, verified = true) {
  const row = { id: newId(), userId, email, verifiedAt: verified ? Date.now() : null, createdAt: Date.now() };
  await db().insert(emailAddresses).values(row);
  return row;
}

export async function addEmailChannel(formId: string, emailAddressId: string, label = "email") {
  const row = {
    id: newId(),
    formId,
    type: "email" as const,
    configEnc: await encryptJson(env, { emailAddressId }),
    label,
    createdAt: Date.now(),
  };
  await db().insert(channels).values(row);
  return row;
}

export async function getSubmission(id: string) {
  return db().select().from(submissions).where(eq(submissions.id, id)).get();
}

/** Polls until `check` returns a truthy value (for work done in waitUntil). */
export async function waitFor<T>(check: () => Promise<T | undefined | null | false>, timeoutMs = 3000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - started > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}
