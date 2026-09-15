import type { ChannelDto, EmailAddressDto, EmailSettingsDto } from "@sendm8/shared";
import { SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emailAddresses, usageDaily, userSettings } from "../src/db/schema";
import { addAddress, api, createForm, db, mockResend, signIn } from "./helpers";

type Data<T> = { data: T };
type Err = { error: { code: string; message: string } };

beforeEach(async () => {
  await db().delete(usageDaily).where(eq(usageDaily.scope, "system_email"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email addresses", () => {
  it("auto-verifies the address the user signed in with", async () => {
    const session = await signIn();
    const { body } = await api<Data<EmailAddressDto[]>>("/emails", { headers: session.headers });
    expect(body.data).toEqual([expect.objectContaining({ email: `${session.userId}@example.com`, verified: true })]);
  });

  it("verifies a new address via an emailed link that needs a click", async () => {
    const resend = mockResend();
    const session = await signIn();

    const created = await api<Data<EmailAddressDto>>("/emails", { method: "POST", body: { email: "Team@Company.test" }, headers: session.headers });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ email: "team@company.test", verified: false });

    const [email] = resend.emails();
    expect(email.to).toEqual(["team@company.test"]);
    const link = email.text.match(/https:\/\/sendm8\.test\/verify\/[\w-]+/)![0];
    const path = new URL(link).pathname;

    // A GET (e.g. a link scanner) must not verify.
    const page = await SELF.fetch(`https://sendm8.test${path}`);
    expect(await page.text()).toContain("Yep, that's me");
    const stillUnverified = await db().select().from(emailAddresses).where(eq(emailAddresses.id, created.body.data.id)).get();
    expect(stillUnverified?.verifiedAt).toBeNull();

    const confirm = await SELF.fetch(`https://sendm8.test${path}`, { method: "POST" });
    expect(confirm.status).toBe(200);
    expect(await confirm.text()).toContain("verified");

    const again = await SELF.fetch(`https://sendm8.test${path}`, { method: "POST" });
    expect(again.status).toBe(400);

    const list = await api<Data<EmailAddressDto[]>>("/emails", { headers: session.headers });
    expect(list.body.data.find((a) => a.email === "team@company.test")?.verified).toBe(true);
  });

  it("stores only a hash of the verification token", async () => {
    const resend = mockResend();
    const session = await signIn();
    const created = await api<Data<EmailAddressDto>>("/emails", { method: "POST", body: { email: "a@b.test" }, headers: session.headers });
    const token = resend.emails()[0].text.match(/verify\/([\w-]+)/)![1];
    const row = await db().select().from(emailAddresses).where(eq(emailAddresses.id, created.body.data.id)).get();
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.tokenHash).not.toContain(token);
  });

  it("rate-limits resends and rejects duplicates", async () => {
    mockResend();
    const session = await signIn();
    const created = await api<Data<EmailAddressDto>>("/emails", { method: "POST", body: { email: "a@b.test" }, headers: session.headers });

    const dup = await api<Err>("/emails", { method: "POST", body: { email: "A@B.test" }, headers: session.headers });
    expect(dup.status).toBe(409);

    const resend = await api<Err>(`/emails/${created.body.data.id}/resend`, { method: "POST", headers: session.headers });
    expect(resend.status).toBe(429);
    expect(resend.body.error.code).toBe("resend_cooldown");
  });
});

describe("channels", () => {
  it("creates an email channel, blocks duplicates, and sends a test", async () => {
    const resend = mockResend();
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    const address = await addAddress(session.userId, "alerts@me.test");

    const created = await api<Data<ChannelDto>>(`/forms/${form.id}/channels`, {
      method: "POST",
      body: { type: "email", emailAddressId: address.id },
      headers: session.headers,
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ type: "email", label: "alerts@me.test", enabled: true, recipientVerified: true });

    const dup = await api(`/forms/${form.id}/channels`, { method: "POST", body: { type: "email", emailAddressId: address.id }, headers: session.headers });
    expect(dup.status).toBe(409);

    const test = await api(`/channels/${created.body.data.id}/test`, { method: "POST", headers: session.headers });
    expect(test.status).toBe(200);
    expect(resend.emails()[0]).toMatchObject({ to: ["alerts@me.test"], subject: expect.stringContaining("[Test]") });

    const disabled = await api<Data<ChannelDto>>(`/channels/${created.body.data.id}`, { method: "PATCH", body: { enabled: false }, headers: session.headers });
    expect(disabled.body.data.enabled).toBe(false);

    const list = await api<Data<ChannelDto[]>>(`/forms/${form.id}/channels`, { headers: session.headers });
    expect(list.body.data).toHaveLength(1);
  });

  it("won't use someone else's address or channel", async () => {
    mockResend();
    const alice = await signIn();
    const bob = await signIn();
    const aliceForm = await createForm({ userId: alice.userId });
    const bobForm = await createForm({ userId: bob.userId });
    const aliceAddress = await addAddress(alice.userId, "alice@me.test");

    const steal = await api(`/forms/${bobForm.id}/channels`, { method: "POST", body: { type: "email", emailAddressId: aliceAddress.id }, headers: bob.headers });
    expect(steal.status).toBe(422);

    const channel = await api<Data<ChannelDto>>(`/forms/${aliceForm.id}/channels`, { method: "POST", body: { type: "email", emailAddressId: aliceAddress.id }, headers: alice.headers });
    for (const [method, path] of [["PATCH", ""], ["DELETE", ""], ["POST", "/test"]] as const) {
      const res = await api(`/channels/${channel.body.data.id}${path}`, { method, body: method === "PATCH" ? { enabled: false } : undefined, headers: bob.headers });
      expect(res.status).toBe(404);
    }
  });

  it("refuses to test an unverified recipient", async () => {
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    const address = await addAddress(session.userId, "new@me.test", false);
    const created = await api<Data<ChannelDto>>(`/forms/${form.id}/channels`, { method: "POST", body: { type: "email", emailAddressId: address.id }, headers: session.headers });
    expect(created.body.data.recipientVerified).toBe(false);
    const test = await api<Err>(`/channels/${created.body.data.id}/test`, { method: "POST", headers: session.headers });
    expect(test.status).toBe(422);
  });
});

describe("BYOK settings", () => {
  const domains = (status = "verified") => Response.json({ object: "list", data: [{ id: "d1", name: "me.dev", status }] });

  it("validates and stores the key encrypted", async () => {
    mockResend((req) => (req.url.endsWith("/domains") ? domains() : undefined));
    const session = await signIn();

    const put = await api<Data<{ keyHint: string }>>("/settings/resend", {
      method: "PUT",
      body: { apiKey: "re_live_abcdefgh1234", from: "Me <hello@me.dev>" },
      headers: session.headers,
    });
    expect(put.status).toBe(200);
    expect(put.body.data.keyHint).toBe("re_••••1234");

    const row = await db().select().from(userSettings).where(eq(userSettings.userId, session.userId)).get();
    expect(row?.resendKeyEnc).toMatch(/^v1:/);
    expect(row?.resendKeyEnc).not.toContain("abcdefgh");

    const get = await api<Data<EmailSettingsDto>>("/settings/email", { headers: session.headers });
    expect(get.body.data.byok).toEqual({ configured: true, keyHint: "re_••••1234", from: "Me <hello@me.dev>", healthy: true, error: null });
    expect(JSON.stringify(get.body)).not.toContain("abcdefgh");

    expect((await api("/settings/resend", { method: "DELETE", headers: session.headers })).status).toBe(204);
    const after = await api<Data<EmailSettingsDto>>("/settings/email", { headers: session.headers });
    expect(after.body.data.byok.configured).toBe(false);
  });

  it("rejects keys whose sending domain isn't verified", async () => {
    mockResend((req) => (req.url.endsWith("/domains") ? domains("pending") : undefined));
    const session = await signIn();
    const res = await api<Err>("/settings/resend", { method: "PUT", body: { apiKey: "re_live_abcdefgh1234", from: "hello@me.dev" }, headers: session.headers });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain("isn't verified");
  });

  it("accepts sending-only keys it can't inspect", async () => {
    mockResend(() => new Response(JSON.stringify({ name: "restricted_api_key", message: "This API key is restricted to only send emails" }), { status: 401 }));
    const session = await signIn();
    const res = await api<Data<{ restricted: boolean }>>("/settings/resend", { method: "PUT", body: { apiKey: "re_send_abcdefgh1234", from: "hello@me.dev" }, headers: session.headers });
    expect(res.status).toBe(200);
    expect(res.body.data.restricted).toBe(true);
  });

  it("rejects invalid keys and from addresses", async () => {
    mockResend(() => new Response(JSON.stringify({ name: "validation_error" }), { status: 401 }));
    const session = await signIn();
    expect((await api("/settings/resend", { method: "PUT", body: { apiKey: "sk_nope", from: "a@b.dev" }, headers: session.headers })).status).toBe(422);
    expect((await api("/settings/resend", { method: "PUT", body: { apiKey: "re_abcdefghijk", from: "not an email" }, headers: session.headers })).status).toBe(422);
    const bad = await api<Err>("/settings/resend", { method: "PUT", body: { apiKey: "re_abcdefghijk", from: "a@b.dev" }, headers: session.headers });
    expect(bad.body.error.code).toBe("resend_key_invalid");
  });
});
