import { createExecutionContext, SELF, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { and, eq, like } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "../src/auth";
import { cleanup } from "../src/cron";
import { errorGroups, usageDaily, user } from "../src/db/schema";
import { sendSystemEmail } from "../src/email/sender";
import worker from "../src/index";
import { alertBody, maskEmail, notifyOps, plain } from "../src/ops/alerts";
import {
  browserSummary,
  captureError,
  describeError,
  fingerprint,
  normaliseMessage,
  recordError,
  scrub,
  scrubPath,
  stackFrames,
} from "../src/ops/errors";
import { signupAlert } from "../src/ops/events";
import { api, createForm, createUser, db, mockFetch, postJson, randomIp, signIn, waitFor } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const HOOK = "https://alerts.example.com/hook";
/** A day nobody else's counters use, so daily caps and dedupes start fresh in each test. */
const freshDay = () => Date.UTC(2090, 0, 1) + Math.floor(Math.random() * 20_000) * 86_400_000;
const alerts = (http: ReturnType<typeof mockFetch>) => http.to("alerts.example.com").map((r) => r.body as { embeds: { title: string; description?: string; fields: { name: string; value: string }[]; footer?: { text: string } }[] });

/** An env whose database throws, to exercise the paths where D1 itself is what's broken. */
function brokenEnv(message: string): Env {
  const DB = new Proxy(env.DB, {
    get(target, prop) {
      if (prop === "prepare" || prop === "batch" || prop === "exec") {
        return () => {
          throw new Error(message);
        };
      }
      return Reflect.get(target, prop);
    },
  });
  return { ...env, DB };
}

describe("alert formatting", () => {
  it("builds a Discord embed that can't ping anyone", () => {
    const body = JSON.parse(
      alertBody(HOOK, { kind: "form_flagged", title: "Form flagged", description: "@everyone look", fields: [{ name: "Form", value: "Bank_Login (abc)" }], path: "/app/admin#ad-reports" }, "https://sendm8.test", 0, true),
    );
    expect(body.allowed_mentions).toEqual({ parse: [] });
    expect(body.embeds[0]).toMatchObject({
      title: "🚩 Form flagged",
      url: "https://sendm8.test/app/admin#ad-reports",
      fields: [{ name: "Form", value: "Bank\\_Login (abc)", inline: true }],
      footer: { text: expect.stringContaining("muted until midnight UTC") },
    });
  });

  it("sends plain text to Slack", () => {
    const body = JSON.parse(alertBody("https://hooks.slack.com/services/T/B/C", { kind: "signup", title: "New sign-up", fields: [{ name: "Email", value: "ad•••@x.test" }], path: "/app" }, "https://sendm8.test", 0));
    expect(body.text).toBe("🎉 *New sign-up*\n*Email:* ad•••@x.test\n<https://sendm8.test/app|Open in sendm8>");
  });

  it("masks emails and strips formatting from user text", () => {
    expect(maskEmail("ada@example.com")).toBe("a•••@example.com");
    expect(maskEmail("jacob@example.com")).toBe("ja•••@example.com");
    expect(maskEmail("nope")).toBe("•••");
    expect(maskEmail(null)).toBe("—");
    expect(plain("**bold** `code` <@123>\n next")).toBe("**bold** code @123 next");
  });
});

describe("notifyOps", () => {
  it("does nothing without a webhook", async () => {
    const http = mockFetch();
    expect(await notifyOps({ ...env, ALERT_WEBHOOK_URL: undefined }, { kind: "signup", title: "x" })).toBe(false);
    expect(http.requests).toHaveLength(0);
  });

  it("dedupes by key and caps each kind per day, noting when it mutes", async () => {
    const http = mockFetch();
    const now = freshDay();
    const capped = { ...env, LIMITS_JSON: JSON.stringify({ opsAlertsPerTypePerDay: 2 }) };

    expect(await notifyOps(capped, { kind: "submission_held", title: "Held", dedupeKey: "form-a" }, now)).toBe(true);
    expect(await notifyOps(capped, { kind: "submission_held", title: "Held", dedupeKey: "form-a" }, now)).toBe(false);
    expect(await notifyOps(capped, { kind: "submission_held", title: "Held", dedupeKey: "form-b" }, now)).toBe(true);
    expect(await notifyOps(capped, { kind: "submission_held", title: "Held", dedupeKey: "form-c" }, now)).toBe(false);

    const sent = alerts(http);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.embeds[0]!.footer).toBeUndefined();
    expect(sent[1]!.embeds[0]!.footer?.text).toContain("muted");
  });

  it("dedupes hourly alerts per hour, and reports failed deliveries", async () => {
    const now = freshDay();
    const http = mockFetch((req) => (req.url === HOOK ? new Response("nope", { status: 500 }) : undefined));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const alert = { kind: "system_email_failing" as const, title: "Resend", dedupeKey: "resend", dedupeWindow: "hour" as const };
    expect(await notifyOps(env, alert, now)).toBe(false);
    expect(await notifyOps(env, alert, now + 60_000)).toBe(false);
    expect(await notifyOps(env, alert, now + 3_600_000)).toBe(false);
    // Delivery failed twice (the 2nd was a duplicate), so two posts were attempted.
    expect(http.to("alerts.example.com")).toHaveLength(2);
  });

  it("never throws, even when the database does", async () => {
    mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await notifyOps(brokenEnv("db down"), { kind: "signup", title: "x" })).toBe(false);
  });
});

describe("error scrubbing and grouping", () => {
  it("removes emails, credentials and tokens but keeps code identifiers", () => {
    expect(scrub("failed for ada@example.com with Bearer re_abc123 token 01jz3k9m2x7q8w4e5r6t7y8u9i")).toBe("failed for [email] with Bearer [secret] token [token]");
    expect(scrub("claimFormsForUserInBackground failed")).toBe("claimFormsForUserInBackground failed");
    expect(scrubPath("https://sendm8.com/confirm/9f8e7d6c5b4a39281706f5e4d3c2b1a0?next=/app#x")).toBe("/confirm/[token]");
    expect(scrubPath("/app/forms/abc1234567")).toBe("/app/forms/abc1234567");
    expect(scrubPath(undefined)).toBeUndefined();
  });

  it("summarises browsers", () => {
    expect(browserSummary("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36")).toBe("Chrome 140 on Windows");
    expect(browserSummary("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("Edge 140 on Windows");
    expect(browserSummary("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari 18 on iOS");
    expect(browserSummary("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox 130 on Linux");
    expect(browserSummary("curl/8")).toBe("Unknown browser");
    expect(browserSummary(null)).toBeUndefined();
  });

  it("reads V8 and Firefox stacks without line numbers, origins or build hashes", () => {
    const v8 = "TypeError: x is undefined\n    at loadInbox (https://sendm8.com/_astro/InboxApp.Bx9_a2Kc.js:12:34)\n    at https://sendm8.com/_astro/client.D4fG7hJk.js:1:2";
    expect(stackFrames(v8)).toEqual(["loadInbox /_astro/InboxApp.js", "<anonymous> /_astro/client.js"]);
    expect(stackFrames("loadInbox@https://sendm8.com/_astro/InboxApp.Bx9_a2Kc.js:12:34\n@debugger eval code:1:1")).toEqual(["loadInbox /_astro/InboxApp.js", "<anonymous> debugger eval code"]);
    expect(stackFrames(null)).toEqual([]);
  });

  it("groups occurrences that only differ in their variable parts", async () => {
    expect(normaliseMessage(`Form "abc" failed after 3 tries`)).toBe(`Form "…" failed after 0 tries`);
    const a = await fingerprint({ source: "worker", name: "Error", message: "timeout after 5000ms", stack: "Error\n    at deliver (index.js:10:2)" });
    const b = await fingerprint({ source: "worker", name: "Error", message: "timeout after 8000ms", stack: "Error\n    at deliver (index.js:99:7)" });
    const c = await fingerprint({ source: "browser", name: "Error", message: "timeout after 5000ms", stack: "Error\n    at deliver (index.js:10:2)" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("describes anything that can be thrown", () => {
    expect(describeError(new RangeError("bad"))).toMatchObject({ name: "RangeError", message: "bad" });
    expect(describeError("plain")).toEqual({ name: "Error", message: "plain", stack: null });
    expect(describeError({ code: 7 })).toEqual({ name: "NonError", message: '{"code":7}', stack: null });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular).message).toBe("[object Object]");
  });
});

describe("error tracking", () => {
  const report = (message: string) => ({ source: "worker" as const, name: "TypeError", message, stack: `TypeError: ${message}\n    at handler (index.js:1:1)`, context: { where: "test", user: "ada@example.com" } });

  it("groups, counts and alerts on new, regressed and milestone errors", async () => {
    const http = mockFetch();
    const now = freshDay();
    const message = `boom ${crypto.randomUUID().slice(0, 4)}x`;

    const id = await recordError(env, report(message), now);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    await recordError(env, report(message), now + 1);
    let row = await db().select().from(errorGroups).where(eq(errorGroups.id, id!)).get();
    expect(row).toMatchObject({ count: 2, firstSeenAt: now, lastSeenAt: now + 1, resolvedAt: null, context: { where: "test", user: "[email]" } });
    expect(alerts(http).map((a) => a.embeds[0]!.title)).toEqual(["💥 New worker error"]);
    expect(alerts(http)[0]!.embeds[0]!.description).toContain("TypeError");

    // Resolved, then it happens again.
    await db().update(errorGroups).set({ resolvedAt: now + 2 }).where(eq(errorGroups.id, id!));
    await recordError(env, report(message), now + 3);
    row = await db().select().from(errorGroups).where(eq(errorGroups.id, id!)).get();
    expect(row?.resolvedAt).toBeNull();
    expect(alerts(http).at(-1)!.embeds[0]!.title).toContain("is back after being resolved");

    // 10th occurrence.
    await db().update(errorGroups).set({ count: 9 }).where(eq(errorGroups.id, id!));
    await recordError(env, report(message), now + 4);
    expect(alerts(http).at(-1)!.embeds[0]!.title).toContain("has happened 10 times");
    expect(alerts(http)).toHaveLength(3);
  });

  it("stops recording past the daily cap", async () => {
    expect(await recordError({ ...env, LIMITS_JSON: JSON.stringify({ errorEventsPerDay: 0 }) }, report("capped"), freshDay())).toBeNull();
  });

  it("still alerts (once per 10 minutes) when the database is what's failing", async () => {
    const http = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = brokenEnv("D1 is down");
    const message = `unsaved ${crypto.randomUUID()}`;
    expect(await recordError(broken, report(message), 1_000)).toBeNull();
    expect(await recordError(broken, report(message), 2_000)).toBeNull();
    expect(alerts(http)).toHaveLength(1);
    expect(alerts(http)[0]!.embeds[0]!.title).toContain("couldn't be saved");
  });

  it("captures and logs worker errors", async () => {
    mockFetch();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const message = `captured ${crypto.randomUUID().slice(0, 6)}z`;
    await captureError(env, new Error(message), { where: "unit test" });
    expect(log).toHaveBeenCalledWith("unit test", expect.any(Error));
    const rows = await db().select().from(errorGroups).where(eq(errorGroups.message, message)).all();
    expect(rows).toHaveLength(1);
  });

  it("captures unhandled route errors and failed scheduled jobs", async () => {
    const http = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://sendm8.test/c/01jz0000000000000000000000"), brokenEnv("route broke"), ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(500);
    const routeAlert = alerts(http).find((a) => a.embeds[0]!.description?.includes("route broke"));
    expect(routeAlert?.embeds[0]!.fields).toEqual(expect.arrayContaining([{ name: "where", value: "request", inline: true }, { name: "route", value: "/c/:id", inline: true }]));

    const outside = createExecutionContext();
    const noUrl = { ...brokenEnv("outside routes"), APP_URL: "" } as Env;
    expect((await worker.fetch(new Request("https://sendm8.test/"), noUrl, outside)).status).toBe(500);
    await waitOnExecutionContext(outside);
    expect(alerts(http).some((a) => a.embeds[0]!.description?.includes("outside routes"))).toBe(true);

    const controller = { cron: "*/5 * * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController;
    await expect(worker.scheduled(controller, brokenEnv("cron broke"))).rejects.toThrow("cron broke");
    const cronAlert = alerts(http).find((a) => a.embeds[0]!.description?.includes("cron broke"));
    expect(cronAlert?.embeds[0]!.fields).toEqual(expect.arrayContaining([{ name: "cron", value: "\\*/5 \\* \\* \\* \\*", inline: true }]));
  });

  it("deletes groups that haven't been seen for the retention period", async () => {
    const now = Date.now();
    await db().insert(errorGroups).values({ id: `old-${crypto.randomUUID()}`, source: "worker", name: "Error", message: "ancient", stack: null, context: {}, firstSeenAt: 0, lastSeenAt: now - 40 * 86_400_000 });
    await cleanup(env, now);
    expect(await db().select().from(errorGroups).where(eq(errorGroups.message, "ancient")).all()).toHaveLength(0);
  });
});

describe("browser error reports", () => {
  const send = (body: unknown, headers: Record<string, string> = {}) =>
    SELF.fetch("https://sendm8.test/api/errors", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://sendm8.test", "cf-connecting-ip": randomIp(), "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Version/18.0 Safari/605.1.15", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("records crashes from the site, with the page path scrubbed", async () => {
    mockFetch();
    const message = `Cannot read properties of undefined (reading '${crypto.randomUUID().slice(0, 8)}')`;
    const res = await send({ name: "TypeError", message, stack: "TypeError\n    at render (https://sendm8.test/_astro/Inbox.abcdEFGH.js:1:2)", page: "https://sendm8.test/confirm/9f8e7d6c5b4a39281706f5e4d3c2b1a0?t=1", kind: "vue", component: "InboxApp" });
    expect(res.status).toBe(204);
    const row = await waitFor(() => db().select().from(errorGroups).where(eq(errorGroups.message, message)).get());
    expect(row).toMatchObject({ source: "browser", name: "TypeError", context: { page: "/confirm/[token]", browser: "Safari 18 on macOS", kind: "vue", component: "InboxApp" } });
  });

  it("rejects other origins, junk and oversized bodies, and ignores browser noise", async () => {
    mockFetch();
    expect((await send({ message: "x" }, { origin: "https://evil.test" })).status).toBe(403);
    expect((await send("{not json")).status).toBe(400);
    expect((await send({ nope: true })).status).toBe(400);
    expect((await send({ message: "x".repeat(17_000) })).status).toBe(413);

    for (const noise of [{ message: "Script error." }, { message: "ResizeObserver loop completed with undelivered notifications." }, { message: "oops", stack: "at chrome-extension://abc/x.js:1:1" }]) {
      expect((await send(noise)).status).toBe(204);
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(await db().select().from(errorGroups).where(like(errorGroups.message, "%ResizeObserver%")).all()).toHaveLength(0);
  });
});

describe("activity alerts", () => {
  it("announces sign-ups with a masked email and the account count", async () => {
    const http = mockFetch();
    await db().delete(usageDaily).where(and(eq(usageDaily.scope, "ops_alert"), eq(usageDaily.scopeId, "signup")));
    expect(await signupAlert(env, { name: "Ada Lovelace", email: "ada.lovelace@example.com" })).toBe(true);
    const [alert] = alerts(http);
    expect(alert!.embeds[0]!.title).toBe("🎉 New sign-up");
    expect(alert!.embeds[0]!.fields).toEqual(expect.arrayContaining([{ name: "Email", value: "ad•••@example.com", inline: true }]));
    expect(JSON.stringify(alert)).not.toContain("ada.lovelace@");

    // The Better Auth hook sends it in the background and never blocks sign-up.
    const hook = getAuth(env).options.databaseHooks!.user!.create!.after!;
    await expect(hook({ id: "u1", name: "Grace", email: "grace@example.com" } as never)).resolves.toBeUndefined();
    await expect(getAuth({ ...env, ALERT_WEBHOOK_URL: undefined } as Env).options.databaseHooks!.user!.create!.after!({ name: "x", email: "x@y.z" } as never)).resolves.toBeUndefined();
  });

  it("announces new forms from the dashboard and from email endpoints", async () => {
    const http = mockFetch();
    await db().delete(usageDaily).where(and(eq(usageDaily.scope, "ops_alert"), eq(usageDaily.scopeId, "form_created")));
    const { headers } = await signIn();
    const name = `Contact ${crypto.randomUUID().slice(0, 6)}`;
    expect((await api("/forms", { method: "POST", headers, body: { name } })).status).toBe(201);
    await waitFor(async () => alerts(http).find((a) => a.embeds[0]!.fields.some((f) => f.value.startsWith(name))));

    const email = `owner${Date.now()}@endpoint.test`;
    expect((await postJson(email, { message: "hello" }, { referer: "https://shop.example/contact" })).status).toBe(200);
    const zero = await waitFor(async () => alerts(http).find((a) => a.embeds[0]!.title.includes("email endpoint")));
    expect(JSON.stringify(zero)).not.toContain(email);
  });

  it("announces held submissions once per form per day", async () => {
    const http = mockFetch();
    const form = await createForm({ name: "Totally Real Bank", status: "active" });
    await postJson(form.id, { username: "ada", password: "hunter2" });
    await postJson(form.id, { username: "bob", password: "letmein" });
    await waitFor(async () => alerts(http).find((a) => a.embeds[0]!.title.includes("held")));
    await new Promise((r) => setTimeout(r, 50));
    const held = alerts(http).filter((a) => a.embeds[0]!.title.includes("held") && a.embeds[0]!.fields.some((f) => f.value.includes(form.id)));
    expect(held).toHaveLength(1);
    expect(held[0]!.embeds[0]!.description).toContain("password");
    expect(JSON.stringify(held[0])).not.toContain("hunter2");
  });

  it("alerts when Resend rejects the shared sender key, at most hourly", async () => {
    await db().delete(usageDaily).where(and(eq(usageDaily.scope, "ops_alert_once"), like(usageDaily.scopeId, "system_email_failing:%")));
    const http = mockFetch((req) => (req.url.startsWith("https://api.resend.com/") ? Response.json({ name: "validation_error", message: "The sendm8.com domain is not verified." }, { status: 403 }) : undefined));
    const message = { to: ["a@b.test"], subject: "Hi", html: "<p>Hi</p>", text: "Hi" };
    expect((await sendSystemEmail(env, message)).ok).toBe(false);
    expect((await sendSystemEmail(env, message)).ok).toBe(false);
    const sent = alerts(http).filter((a) => a.embeds[0]!.title.includes("Resend rejected"));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.embeds[0]!.fields[0]!.value).toContain("not verified");
  });
});

describe("admin errors API", () => {
  async function adminHeaders() {
    const existing = await db().select().from(user).where(eq(user.email, "boss@sendm8.test")).get();
    const boss = existing ?? (await createUser({ email: "boss@sendm8.test" }));
    return (await signIn(boss.id)).headers;
  }

  it("lists, resolves and reopens error groups, and hides from non-admins", async () => {
    const headers = await adminHeaders();
    const id = `admin-${crypto.randomUUID()}`;
    await db().insert(errorGroups).values({ id, source: "browser", name: "TypeError", message: "admin list", stack: "TypeError", context: { page: "/app" }, firstSeenAt: 1, lastSeenAt: Date.now() });

    const open = await api<{ data: { id: string }[] }>("/admin/errors", { headers });
    expect(open.body.data.some((g) => g.id === id)).toBe(true);

    expect((await api(`/admin/errors/${id}/resolve`, { method: "POST", headers })).status).toBe(200);
    expect((await api<{ data: { id: string }[] }>("/admin/errors", { headers })).body.data.some((g) => g.id === id)).toBe(false);
    const resolved = await api<{ data: { id: string; resolvedAt: number }[] }>("/admin/errors?status=resolved", { headers });
    expect(resolved.body.data.find((g) => g.id === id)?.resolvedAt).toBeGreaterThan(0);
    expect((await api<{ data: { id: string }[] }>("/admin/errors?status=all", { headers })).body.data.some((g) => g.id === id)).toBe(true);

    expect((await api(`/admin/errors/${id}/reopen`, { method: "POST", headers })).status).toBe(200);
    expect((await db().select().from(errorGroups).where(eq(errorGroups.id, id)).get())?.resolvedAt).toBeNull();

    expect((await api("/admin/errors/nope/resolve", { method: "POST", headers })).status).toBe(404);
    expect((await api("/admin/errors", { headers: (await signIn()).headers })).status).toBe(404);
  });
});
