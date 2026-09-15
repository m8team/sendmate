import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLimits } from "../src/config";
import { retryDueDeliveries, cleanup } from "../src/cron";
import { submissions, usageDaily, userSettings } from "../src/db/schema";
import { claimSystemEmail } from "../src/email/budget";
import { encryptSecret } from "../src/lib/secrets";
import { dayKey } from "../src/lib/time";
import { deliverSubmission, nextDigestAt } from "../src/pipeline/deliver";
import { sendDueDigests } from "../src/pipeline/digest";
import { addAddress, addEmailChannel, createForm, createUser, db, getSubmission, mockResend, postJson, waitFor } from "./helpers";

async function setup(opts: { verified?: boolean; notifyMode?: "instant" | "digest" | "off" } = {}) {
  const owner = await createUser();
  const form = await createForm({ userId: owner.id, name: "Contact", settings: opts.notifyMode ? { notifyMode: opts.notifyMode } : {} });
  const address = await addAddress(owner.id, `${owner.id}@inbox.test`, opts.verified ?? true);
  const channel = await addEmailChannel(form.id, address.id, address.email);
  return { owner, form, address, channel };
}

async function submitAndSettle(formId: string, body: Record<string, string>) {
  const res = await postJson(formId, body);
  const { id } = await res.json<{ id: string }>();
  return waitFor(async () => {
    const row = await getSubmission(id);
    return row && row.deliveries.length > 0 ? row : undefined;
  });
}

beforeEach(async () => {
  await db().delete(usageDaily).where(eq(usageDaily.scope, "system_email"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("instant email notifications", () => {
  it("emails verified recipients through the system sender", async () => {
    const resend = mockResend();
    const { form, address, channel } = await setup();

    const row = await submitAndSettle(form.id, { email: "lead@customer.co", message: "<script>alert(1)</script>\nSecond line", _subject: "Quote\r\nBcc: x@y.z" });

    expect(row.deliveries).toEqual([expect.objectContaining({ channelId: channel.id, status: "sent", attempts: 1 })]);
    const [email] = resend.emails();
    expect(email.from).toBe("sendm8 <notify@sendm8.test>");
    expect(email.to).toEqual([address.email]);
    expect(email.reply_to).toBe("lead@customer.co");
    expect(email.subject).toBe("Quote Bcc: x@y.z");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.text).toContain("Second line");
    expect(resend.requests[0]!.headers.get("idempotency-key")).toBe(`notify:${row.id}:${channel.id}`);
    expect(resend.requests[0]!.headers.get("authorization")).toBe("Bearer re_system_test");
  });

  it("skips unverified recipients without sending", async () => {
    const resend = mockResend();
    const { form } = await setup({ verified: false });
    const row = await submitAndSettle(form.id, { message: "hi" });
    expect(row.deliveries[0]).toMatchObject({ status: "skipped", error: "recipient_unverified" });
    expect(resend.emails()).toHaveLength(0);
  });

  it("doesn't notify for spam or held submissions", async () => {
    const resend = mockResend();
    const { form } = await setup();
    const res = await postJson(form.id, { password: "hunter2" });
    const { id } = await res.json<{ id: string }>();
    await deliverSubmission(env, id);
    expect((await getSubmission(id))?.deliveries).toEqual([]);
    expect(resend.emails()).toHaveLength(0);
  });

  it("only CCs addresses the owner has verified", async () => {
    const resend = mockResend();
    const { form, owner } = await setup();
    await addAddress(owner.id, "teammate@inbox.test", true);
    await submitAndSettle(form.id, { message: "hi", _cc: "teammate@inbox.test, stranger@elsewhere.test" });
    expect(resend.emails()[0].cc).toEqual(["teammate@inbox.test"]);
  });

  it("falls back to the digest when the user's instant cap is used up", async () => {
    const resend = mockResend();
    const { form, owner } = await setup();
    const limits = getLimits(env);
    await db().insert(usageDaily).values({ scope: "user_email", scopeId: owner.id, day: dayKey(Date.now()), emails: limits.instantEmailsPerUserPerDay });

    const row = await submitAndSettle(form.id, { message: "hi" });
    expect(row.deliveries[0]).toMatchObject({ status: "digest", error: "instant_limit_reached" });
    expect(row.digestAt).toBe(nextDigestAt(row.createdAt, limits));
    expect(resend.emails()).toHaveLength(0);
  });

  it("queues digest-mode forms without sending instantly", async () => {
    const resend = mockResend();
    const { form } = await setup({ notifyMode: "digest" });
    const row = await submitAndSettle(form.id, { message: "hi" });
    expect(row.deliveries[0]?.status).toBe("digest");
    expect(resend.emails()).toHaveLength(0);
  });

  it("retries transient failures with backoff, then succeeds", async () => {
    let fail = true;
    const resend = mockResend(() => (fail ? new Response(JSON.stringify({ name: "application_error" }), { status: 500 }) : undefined));
    const { form } = await setup();

    const row = await submitAndSettle(form.id, { message: "hi" });
    expect(row.deliveries[0]).toMatchObject({ status: "failed", attempts: 1 });
    expect(row.retryAt).toBeGreaterThan(Date.now());

    fail = false;
    await retryDueDeliveries(env, row.retryAt! + 1);
    const retried = await getSubmission(row.id);
    expect(retried?.deliveries[0]).toMatchObject({ status: "sent", attempts: 2 });
    expect(retried?.retryAt).toBeNull();
    expect(resend.emails()).toHaveLength(2);
  });

  it("gives up on permanent failures", async () => {
    mockResend(() => new Response(JSON.stringify({ name: "validation_error", message: "bad" }), { status: 422 }));
    const { form } = await setup();
    const row = await submitAndSettle(form.id, { message: "hi" });
    expect(row.deliveries[0]?.status).toBe("skipped");
    expect(row.retryAt).toBeNull();
  });
});

describe("bring your own Resend key", () => {
  async function withByok() {
    const ctx = await setup();
    await db()
      .insert(userSettings)
      .values({ userId: ctx.owner.id, resendKeyEnc: await encryptSecret(env, "re_user_key_123456"), resendKeyHint: "re_••••3456", resendFrom: "Me <hi@me.dev>", resendVerifiedAt: Date.now() });
    return ctx;
  }

  it("sends with the user's key and sender, without touching the system budget", async () => {
    const resend = mockResend();
    const { form, owner } = await withByok();
    await db().insert(usageDaily).values({ scope: "user_email", scopeId: owner.id, day: dayKey(Date.now()), emails: 999 });

    const row = await submitAndSettle(form.id, { message: "hi" });
    expect(row.deliveries[0]?.status).toBe("sent");
    expect(resend.requests[0]!.headers.get("authorization")).toBe("Bearer re_user_key_123456");
    expect(resend.emails()[0].from).toBe("Me <hi@me.dev>");
    const system = await db().select().from(usageDaily).where(eq(usageDaily.scope, "system_email")).all();
    expect(system).toEqual([]);
  });

  it("flags a rejected key and falls back to the digest", async () => {
    mockResend(() => new Response(JSON.stringify({ name: "restricted_api_key", message: "API key is not active" }), { status: 403 }));
    const { form, owner } = await withByok();

    const row = await submitAndSettle(form.id, { message: "hi" });
    expect(row.deliveries[0]).toMatchObject({ status: "digest", error: "byok_key_rejected" });
    const settings = await db().select().from(userSettings).where(eq(userSettings.userId, owner.id)).get();
    expect(settings?.resendKeyError).toContain("restricted_api_key");
  });
});

describe("digests", () => {
  it("sends one digest per recipient and marks deliveries sent", async () => {
    const resend = mockResend();
    const { form, address } = await setup({ notifyMode: "digest" });
    const first = await submitAndSettle(form.id, { name: "Ada", message: "one" });
    const second = await submitAndSettle(form.id, { name: "Grace", message: "two" });
    expect(resend.emails()).toHaveLength(0);

    // Other tests in this file may leave digests due too, so only look at this recipient.
    await sendDueDigests(env, first.digestAt! + 1);
    const mine = resend.emails().filter((e) => e.to[0] === address.email);
    expect(mine).toHaveLength(1);

    const [email] = mine;
    expect(email.to).toEqual([address.email]);
    expect(email.subject).toBe("Your sendm8 digest: 2 new submissions");
    expect(email.html).toContain("Ada");
    expect(email.html).toContain("Grace");

    for (const id of [first.id, second.id]) {
      const row = await getSubmission(id);
      expect(row?.digestAt).toBeNull();
      expect(row?.deliveries[0]).toMatchObject({ status: "sent", viaDigest: true });
    }
  });

  it("leaves digests queued when the system budget is exhausted", async () => {
    const resend = mockResend();
    const { form } = await setup({ notifyMode: "digest" });
    const row = await submitAndSettle(form.id, { message: "hi" });
    const limits = getLimits(env);
    await db().insert(usageDaily).values({ scope: "system_email", scopeId: "all", day: dayKey(row.digestAt! + 1), emails: limits.systemEmailsPerDay });

    await sendDueDigests(env, row.digestAt! + 1);
    expect(resend.emails()).toHaveLength(0);
    expect((await getSubmission(row.id))?.digestAt).toBe(row.digestAt);
  });
});

describe("system email budget", () => {
  it("reserves part of the daily budget for account emails", async () => {
    const limits = getLimits(env);
    const now = Date.now();
    const user = await createUser();
    await db()
      .insert(usageDaily)
      .values({ scope: "system_email", scopeId: "all", day: dayKey(now), emails: limits.systemEmailsPerDay - limits.reservedAccountEmailsPerDay });

    expect(await claimSystemEmail(env.DB, limits, "instant", user.id, now)).toBe(false);
    expect(await claimSystemEmail(env.DB, limits, "digest", user.id, now)).toBe(false);
    expect(await claimSystemEmail(env.DB, limits, "account", user.id, now)).toBe(true);

    const userRow = await db()
      .select()
      .from(usageDaily)
      .where(and(eq(usageDaily.scope, "user_email"), eq(usageDaily.scopeId, user.id)))
      .get();
    expect(userRow).toBeUndefined();
  });

  it("refunds the global counter when the per-user cap blocks a send", async () => {
    const limits = getLimits(env);
    const now = Date.now();
    const user = await createUser();
    await db().insert(usageDaily).values({ scope: "user_email", scopeId: user.id, day: dayKey(now), emails: limits.instantEmailsPerUserPerDay });

    expect(await claimSystemEmail(env.DB, limits, "instant", user.id, now)).toBe(false);
    const global = await db().select().from(usageDaily).where(eq(usageDaily.scope, "system_email")).get();
    expect(global?.emails ?? 0).toBe(0);
  });
});

describe("cleanup", () => {
  it("deletes old spam but keeps everything else", async () => {
    const form = await createForm();
    const old = Date.now() - 40 * 86_400_000;
    const base = { formId: form.id, data: {}, meta: { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] }, createdAt: old };
    await db()
      .insert(submissions)
      .values([
        { ...base, id: "old-spam", status: "spam" },
        { ...base, id: "old-ok", status: "ok" },
        { ...base, id: "new-spam", status: "spam", createdAt: Date.now() },
      ]);

    await cleanup(env, Date.now());
    const ids = (await db().select({ id: submissions.id }).from(submissions).where(eq(submissions.formId, form.id)).all()).map((r) => r.id).sort();
    expect(ids).toEqual(["new-spam", "old-ok"]);
  });
});
