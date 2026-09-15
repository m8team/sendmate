import type { EmailAddressDto } from "@sendm8/shared";
import { LIMITS } from "@sendm8/shared";
import { createScheduledController, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLimits } from "../src/config";
import { emailAddresses, submissions, usageDaily, userSettings } from "../src/db/schema";
import { sendSystemEmail } from "../src/email/sender";
import { consumeVerificationToken } from "../src/email/verification";
import { submissionsToCsv } from "../src/lib/csv";
import { dayKey } from "../src/lib/time";
import { decryptSecret, encryptSecret } from "../src/lib/secrets";
import { sendDueDigests } from "../src/pipeline/digest";
import worker from "../src/index";
import { addAddress, addEmailChannel, api, createForm, createUser, db, getSubmission, listSubmissions, mockFetch, signIn, waitFor } from "./helpers";

type Data<T> = { data: T };
type Err = { error: { code: string; message: string } };

beforeEach(async () => {
  await db().delete(usageDaily).where(eq(usageDaily.scope, "system_email"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("limits config", () => {
  it("applies numeric overrides from LIMITS_JSON and ignores junk", () => {
    const limits = getLimits({ LIMITS_JSON: '{"systemEmailsPerDay": 1600, "maxFields": "lots", "unknown": 5}' });
    expect(limits.systemEmailsPerDay).toBe(1600);
    expect(limits.maxFields).toBe(LIMITS.maxFields);
    expect(limits).not.toHaveProperty("unknown");
  });

  it("falls back to defaults on invalid JSON or an empty value", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(getLimits({ LIMITS_JSON: "{nope" })).toEqual(LIMITS);
    expect(getLimits({ LIMITS_JSON: "" })).toEqual(LIMITS);
  });
});

describe("routing", () => {
  it("hides API routes from signed-out users, 404s for signed-in ones, and shows a page elsewhere", async () => {
    expect((await SELF.fetch("https://sendm8.test/api/nope")).status).toBe(401);
    const session = await signIn();
    const apiRes = await api<Err>("/nope", { headers: session.headers });
    expect(apiRes.status).toBe(404);
    expect(apiRes.body.error.code).toBe("not_found");

    const page = await SELF.fetch("https://sendm8.test/definitely-not-here");
    expect(page.status).toBe(404);
    expect(await page.text()).toContain("Return to sender");
  });

  it("explains the endpoint when a form URL is opened in a browser", async () => {
    const res = await SELF.fetch("https://sendm8.test/f/abc1234567");
    expect(await res.text()).toContain("https://sendm8.test/f/abc1234567");
  });

  it("only links back to http(s) pages from the thank-you page", async () => {
    const good = await SELF.fetch(`https://sendm8.test/thanks?back=${encodeURIComponent("https://site.dev/contact")}`);
    expect(await good.text()).toContain("Back to site.dev");
    const evil = await SELF.fetch(`https://sendm8.test/thanks?back=${encodeURIComponent("javascript:alert(1)")}`);
    expect(await evil.text()).not.toContain("javascript:");
  });

  it("dispatches cron triggers", async () => {
    const http = mockFetch();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id, settings: { notifyMode: "digest" } });
    const address = await addAddress(owner.id, `${owner.id}@cron.test`);
    await addEmailChannel(form.id, address.id);
    const res = await SELF.fetch(`https://sendm8.test/f/${form.id}`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: '{"a":"b"}' });
    const { id } = await res.json<{ id: string }>();
    const row = await waitFor(async () => (await getSubmission(id))?.digestAt ?? undefined);

    await worker.scheduled(createScheduledController({ cron: "0 * * * *", scheduledTime: row + 1 }), env);
    expect(http.emails().some((e) => e.to[0] === address.email)).toBe(true);

    await worker.scheduled(createScheduledController({ cron: "*/5 * * * *", scheduledTime: Date.now() }), env);
    await worker.scheduled(createScheduledController({ cron: "0 * * * *", scheduledTime: Date.UTC(2030, 0, 1, 3) }), env);
  });
});

describe("email plumbing", () => {
  it("logs instead of sending when no system key is configured", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await sendSystemEmail({ RESEND_API_KEY: "", EMAIL_FROM: "x", APP_URL: "" }, { to: ["a@b.test"], subject: "Hi", html: "<p>Hi</p>", text: "Hi" });
    expect(result).toEqual({ ok: true, id: "dev-logged" });
    expect(log.mock.calls[0]![0]).toContain('subject="Hi"');
  });

  it("round-trips secrets and rejects tampered or foreign ciphertext", async () => {
    const encrypted = await encryptSecret(env, "re_secret");
    expect(await decryptSecret(env, encrypted)).toBe("re_secret");
    await expect(decryptSecret(env, "v2:abc:def")).rejects.toThrow("Unsupported");
    const [v, iv, ct] = encrypted.split(":");
    const tampered = `${v}:${iv}:${ct!.slice(0, -4)}AAAA`;
    await expect(decryptSecret(env, tampered)).rejects.toThrow();
    await expect(encryptSecret({ ENCRYPTION_KEY: "c2hvcnQ=" }, "x")).rejects.toThrow("32 bytes");
  });

  it("expires verification tokens after 24 hours", async () => {
    const owner = await createUser();
    const address = await addAddress(owner.id, "late@me.test", false);
    const { sha256Hex } = await import("../src/lib/crypto");
    await db()
      .update(emailAddresses)
      .set({ tokenHash: await sha256Hex("tok"), tokenSentAt: Date.now() - 25 * 3600_000 })
      .where(eq(emailAddresses.id, address.id));
    expect(await consumeVerificationToken(db(), "tok")).toBeNull();
    expect(await consumeVerificationToken(db(), "unknown")).toBeNull();
  });

  it("sends digests with the user's own key", async () => {
    const http = mockFetch();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id, settings: { notifyMode: "digest" } });
    const address = await addAddress(owner.id, `${owner.id}@byok.test`);
    await addEmailChannel(form.id, address.id);
    await db()
      .insert(userSettings)
      .values({ userId: owner.id, resendKeyEnc: await encryptSecret(env, "re_user_digest"), resendFrom: "Me <me@me.dev>" });

    const res = await SELF.fetch(`https://sendm8.test/f/${form.id}`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: '{"a":"b"}' });
    const { id } = await res.json<{ id: string }>();
    const digestAt = await waitFor(async () => (await getSubmission(id))?.digestAt ?? undefined);

    await sendDueDigests(env, digestAt + 1);
    const sent = http.requests.find((r) => r.body?.to?.[0] === address.email);
    expect(sent?.headers.get("authorization")).toBe("Bearer re_user_digest");
    expect((await getSubmission(id))?.digestAt).toBeNull();
  });

  it("marks digest deliveries skipped when the recipient was removed", async () => {
    const http = mockFetch();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id, settings: { notifyMode: "digest" } });
    const address = await addAddress(owner.id, `${owner.id}@gone.test`);
    await addEmailChannel(form.id, address.id);
    const res = await SELF.fetch(`https://sendm8.test/f/${form.id}`, { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: '{"a":"b"}' });
    const { id } = await res.json<{ id: string }>();
    const digestAt = await waitFor(async () => (await getSubmission(id))?.digestAt ?? undefined);

    await db().delete(emailAddresses).where(eq(emailAddresses.id, address.id));
    await sendDueDigests(env, digestAt + 1);
    const row = await getSubmission(id);
    expect(row?.deliveries[0]).toMatchObject({ status: "skipped", error: "recipient_removed" });
    expect(row?.digestAt).toBeNull();
    expect(http.requests.some((r) => r.body?.to?.[0] === address.email)).toBe(false);
  });
});

describe("email addresses API", () => {
  it("resends after the cooldown and deletes addresses", async () => {
    const http = mockFetch();
    const session = await signIn();
    const created = await api<Data<EmailAddressDto>>("/emails", { method: "POST", body: { email: "later@me.test" }, headers: session.headers });
    await db().update(emailAddresses).set({ tokenSentAt: Date.now() - 11 * 60_000 }).where(eq(emailAddresses.id, created.body.data.id));

    const resent = await api(`/emails/${created.body.data.id}/resend`, { method: "POST", headers: session.headers });
    expect(resent.status).toBe(200);
    expect(http.emails()).toHaveLength(2);

    expect((await api(`/emails/${created.body.data.id}`, { method: "DELETE", headers: session.headers })).status).toBe(204);
    expect((await api(`/emails/${created.body.data.id}`, { method: "DELETE", headers: session.headers })).status).toBe(404);
  });

  it("won't resend to an already verified address", async () => {
    const session = await signIn();
    const address = await addAddress(session.userId, "done@me.test", true);
    const res = await api<Err>(`/emails/${address.id}/resend`, { method: "POST", headers: session.headers });
    expect(res.body.error.code).toBe("already_verified");
  });

  it("tells the user when the daily email budget is used up", async () => {
    mockFetch();
    const session = await signIn();
    const limits = getLimits(env);
    await db().insert(usageDaily).values({ scope: "system_email", scopeId: "all", day: dayKey(Date.now()), emails: limits.systemEmailsPerDay });
    const res = await api<Err>("/emails", { method: "POST", body: { email: "busy@me.test" }, headers: session.headers });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("email_budget_exhausted");
  });

  it("reports a failed verification send", async () => {
    mockFetch(() => new Response(JSON.stringify({ name: "application_error" }), { status: 500 }));
    const session = await signIn();
    const res = await api<Err>("/emails", { method: "POST", body: { email: "flaky@me.test" }, headers: session.headers });
    expect(res.status).toBe(502);
  });

  it("instantly verifies the account email if it's added manually", async () => {
    const session = await signIn();
    const res = await api<Data<EmailAddressDto>>("/emails", { method: "POST", body: { email: `${session.userId}@example.com` }, headers: session.headers });
    expect(res.body.data.verified).toBe(true);
  });

  it("caps addresses per user", async () => {
    mockFetch();
    const session = await signIn();
    for (let i = 0; i < 10; i++) await addAddress(session.userId, `a${i}@me.test`, true);
    const res = await api<Err>("/emails", { method: "POST", body: { email: "one-too-many@me.test" }, headers: session.headers });
    expect(res.body.error.code).toBe("email_limit_reached");
  });
});

describe("parsing edge cases", () => {
  it("accepts text/plain bodies, PHP-style array names, and rejects unknown content types", async () => {
    const form = await createForm();
    const ok = await SELF.fetch(`https://sendm8.test/f/${form.id}`, {
      method: "POST",
      headers: { "content-type": "text/plain", accept: "application/json" },
      body: "colour[]=red&colour[]=blue&note=hi",
    });
    expect(ok.status).toBe(200);
    const [row] = await listSubmissions(form.id);
    expect(row?.data).toEqual({ colour: ["red", "blue"], note: "hi" });

    const xml = await SELF.fetch(`https://sendm8.test/f/${form.id}`, { method: "POST", headers: { "content-type": "application/xml", accept: "application/json" }, body: "<a/>" });
    expect(xml.status).toBe(415);
  });

  it("rejects non-object JSON and over-long field names", async () => {
    const form = await createForm();
    const arr = await SELF.fetch(`https://sendm8.test/f/${form.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "[1,2]" });
    expect(arr.status).toBe(400);
    const longName = await SELF.fetch(`https://sendm8.test/f/${form.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ["x".repeat(101)]: "v" }),
    });
    expect(longName.status).toBe(400);
  });

  it("rejects malformed API JSON bodies", async () => {
    const session = await signIn();
    const res = await SELF.fetch("https://sendm8.test/api/forms", { method: "POST", headers: { ...session.headers, "content-type": "application/json" }, body: "{" });
    expect(res.status).toBe(400);
  });

  it("CSV-exports arrays and continues pages without repeating the header", () => {
    const row = { id: "1", formId: "f", data: { tags: ["a", "b"] }, status: "ok" as const, spamScore: 0, starred: false, createdAt: 0, country: null, referrer: null, userAgent: null, special: {}, spamReasons: [], droppedFiles: [], files: [], deliveries: [], retryAt: null };
    expect(submissionsToCsv([row], true)).toBe("id,created_at,status,tags\r\n1,1970-01-01T00:00:00.000Z,ok,a; b\r\n");
    expect(submissionsToCsv([row], false)).not.toContain("created_at");
  });

  it("cleans up spam older than the retention window only", async () => {
    const { cleanup } = await import("../src/cron");
    const form = await createForm();
    const meta = { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] };
    await db().insert(submissions).values({ id: "platform-old-spam", formId: form.id, data: {}, meta, status: "spam", createdAt: 0 });
    await cleanup(env, Date.now());
    expect(await getSubmission("platform-old-spam")).toBeUndefined();
  });
});
