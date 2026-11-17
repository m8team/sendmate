import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emailAddresses, emailSuppressions } from "../src/db/schema";
import { sendSystemEmail } from "../src/email/sender";
import { suppress } from "../src/email/suppression";
import worker from "../src/index";
import { verifyWebhookSignature } from "../src/lib/webhook-signature";
import { sendConfirmationReminders } from "../src/pipeline/zero-signup";
import { addAddress, api, createUser, db, mockFetch, postForm, postJson, signIn, waitFor } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const SECRET = env.RESEND_WEBHOOK_SECRET!;
let counter = 0;
const address = () => `bounce${Date.now()}${counter++}@bounce-test.dev`;

/** Signs a body the way Svix does, so the tests exercise the real verification. */
async function sign(body: string, { id = `msg_${counter++}`, at = Date.now(), secret = SECRET } = {}) {
  const timestamp = String(Math.floor(at / 1000));
  const bytes = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  return { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${btoa(String.fromCharCode(...mac))}` };
}

async function deliverEvent(event: unknown, headers?: Record<string, string>) {
  const body = JSON.stringify(event);
  return SELF.fetch("https://sendm8.test/api/webhooks/resend", {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers ?? (await sign(body))) },
    body,
  });
}

const bounced = (to: string[], type = "Permanent") => ({ type: "email.bounced", data: { to, bounce: { type, subType: "General", message: "The recipient's mailbox doesn't exist" } } });
const suppressedRow = (email: string) => db().select().from(emailSuppressions).where(eq(emailSuppressions.email, email.toLowerCase())).get();

describe("webhook signatures", () => {
  const body = '{"type":"email.bounced"}';
  const parts = (h: Record<string, string>) => ({ id: h["svix-id"]!, timestamp: h["svix-timestamp"]!, signature: h["svix-signature"]! });

  it("accepts a genuine signature, and refuses anything else", async () => {
    const good = await sign(body);
    expect(await verifyWebhookSignature(SECRET, parts(good), body)).toBe(true);
    // A tampered body, the wrong secret, missing headers and a mangled signature.
    expect(await verifyWebhookSignature(SECRET, parts(good), body + " ")).toBe(false);
    expect(await verifyWebhookSignature("whsec_" + btoa("a different secret"), parts(good), body)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, { id: null, timestamp: null, signature: null }, body)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, { ...parts(good), signature: "v1,not-base64!!" }, body)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, { ...parts(good), signature: "v2," + good["svix-signature"]!.slice(3) }, body)).toBe(false);
  });

  it("takes any one of several signatures, as during a secret rotation", async () => {
    const good = await sign(body);
    const header = `v1,${btoa("stale")} ${good["svix-signature"]}`;
    expect(await verifyWebhookSignature(SECRET, { ...parts(good), signature: header }, body)).toBe(true);
  });

  it("refuses a request that's too old or from the future, so captures can't be replayed", async () => {
    const old = await sign(body, { at: Date.now() - 10 * 60_000 });
    expect(await verifyWebhookSignature(SECRET, parts(old), body)).toBe(false);
    const future = await sign(body, { at: Date.now() + 10 * 60_000 });
    expect(await verifyWebhookSignature(SECRET, parts(future), body)).toBe(false);
  });
});

describe("Resend webhook", () => {
  it("records a hard bounce, alerts the operator once, and says nothing about anyone else", async () => {
    const http = mockFetch();
    const gone = address();
    const res = await deliverEvent(bounced([gone.toUpperCase()]));
    expect(res.status).toBe(200);
    expect(await suppressedRow(gone)).toMatchObject({ reason: "bounce" });
    await waitFor(async () => (http.to("alerts.example.com").length > 0 ? true : undefined));

    // Resend retries and repeats: the same address again is a no-op, with no second alert.
    const before = http.to("alerts.example.com").length;
    expect((await deliverEvent(bounced([gone]))).status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(http.to("alerts.example.com")).toHaveLength(before);
  });

  it("records every recipient, and spam complaints too", async () => {
    mockFetch();
    const [a, b, c] = [address(), address(), address()];
    await deliverEvent(bounced([a, b]));
    expect(await suppressedRow(a)).toBeTruthy();
    expect(await suppressedRow(b)).toBeTruthy();
    await deliverEvent({ type: "email.complained", data: { to: [c] } });
    expect(await suppressedRow(c)).toMatchObject({ reason: "complaint" });
  });

  it("ignores soft bounces and events it doesn't care about, which can recover", async () => {
    mockFetch();
    const soft = address();
    for (const event of [bounced([soft], "Transient"), bounced([soft], "Undetermined"), { type: "email.delivered", data: { to: [soft] } }, { type: "email.opened", data: {} }]) {
      const res = await deliverEvent(event);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { ignored?: string }).ignored).toBeTruthy();
    }
    expect(await suppressedRow(soft)).toBeUndefined();
  });

  it("refuses unsigned, forged and stale requests, and does nothing without a secret", async () => {
    mockFetch();
    const victim = address();
    const event = bounced([victim]);
    const body = JSON.stringify(event);
    expect((await deliverEvent(event, {})).status).toBe(401);
    expect((await deliverEvent(event, await sign(body, { secret: "whsec_" + btoa("attacker's own secret") }))).status).toBe(401);
    expect((await deliverEvent(event, await sign(body, { at: Date.now() - 10 * 60_000 }))).status).toBe(401);
    expect(await suppressedRow(victim)).toBeUndefined();

    const noSecret = await worker.fetch(
      new Request("https://sendm8.test/api/webhooks/resend", { method: "POST", headers: await sign(body), body }),
      { ...env, RESEND_WEBHOOK_SECRET: undefined } as Env,
      { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext,
    );
    expect(noSecret.status).toBe(404);
    expect(await suppressedRow(victim)).toBeUndefined();
  });

  it("rejects bodies that aren't JSON or are huge", async () => {
    const bad = "not json";
    expect((await SELF.fetch("https://sendm8.test/api/webhooks/resend", { method: "POST", headers: await sign(bad), body: bad })).status).toBe(400);
    const huge = "x".repeat(200_000);
    expect((await SELF.fetch("https://sendm8.test/api/webhooks/resend", { method: "POST", headers: await sign(huge), body: huge })).status).toBe(413);
  });
});

describe("what a suppressed address changes", () => {
  it("system emails to it are skipped without calling Resend, and others in the same message still go", async () => {
    const http = mockFetch();
    const gone = address();
    const fine = address();
    await suppress(db(), gone, "bounce", "test");

    const skipped = await sendSystemEmail(env, { to: [gone], subject: "hi", html: "<p>hi</p>", text: "hi" });
    expect(skipped).toMatchObject({ ok: false, retryable: false });
    expect(http.emails()).toHaveLength(0);

    await sendSystemEmail(env, { to: [gone, fine], subject: "hi", html: "<p>hi</p>", text: "hi" });
    expect(http.emails().map((e) => e.to)).toEqual([[fine]]);
  });

  it("an email endpoint on a bounced address stores the submission but sends no confirmation, and doesn't burn the cooldown", async () => {
    const http = mockFetch();
    const gone = address();
    await suppress(db(), gone, "bounce", "test");

    expect((await postJson(gone, { message: "hello" })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(http.emails().filter((e) => e.to[0] === gone)).toHaveLength(0);
    const row = await db().select().from(emailAddresses).where(eq(emailAddresses.email, gone)).get();
    expect(row?.tokenSentAt ?? null).toBeNull();
  });

  it("a reminder is never sent to a bounced address", async () => {
    const http = mockFetch();
    const gone = address();
    await postForm(gone, { message: "a real enquiry" }, { referer: "https://real-site.dev/" });
    await waitFor(async () => http.emails().find((e) => e.to[0] === gone));
    await db().update(emailAddresses).set({ tokenSentAt: Date.now() - 4 * 86_400_000 }).where(eq(emailAddresses.email, gone));

    await suppress(db(), gone, "bounce", "test");
    const before = http.emails().length;
    await sendConfirmationReminders(env);
    expect(http.emails().slice(before).filter((e) => e.to[0] === gone)).toHaveLength(0);
  });

  it("the dashboard marks an address as bounced", async () => {
    mockFetch();
    const owner = await createUser();
    const gone = address();
    const fine = address();
    await addAddress(owner.id, gone, true);
    await addAddress(owner.id, fine, true);
    await suppress(db(), gone, "complaint", "spam complaint");

    const session = await signIn(owner.id);
    const list = await api<{ data: { email: string; bounced?: boolean }[] }>("/emails", { headers: session.headers });
    expect(list.body.data.find((a) => a.email === gone)?.bounced).toBe(true);
    expect(list.body.data.find((a) => a.email === fine)?.bounced).toBe(false);
  });
});
