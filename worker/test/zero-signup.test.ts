import type { ChannelDto, FormDto } from "@sendm8/shared";
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLimits } from "../src/config";
import { channels, emailAddresses, forms, usageDaily } from "../src/db/schema";
import { dayKey } from "../src/lib/time";
import { DECLINED_REASON, sendOwnerConfirmation } from "../src/pipeline/zero-signup";
import { addAddress, api, createUser, db, getSubmission, listSubmissions, mockFetch, postForm, postJson, signIn, waitFor } from "./helpers";

type Data<T> = { data: T };

let counter = 0;
const uniqueEmail = () => `owner${Date.now()}${counter++}@zero.test`;

const formFor = (email: string) => db().select().from(forms).where(eq(forms.ownerEmail, email)).get();

async function confirmationToken(http: ReturnType<typeof mockFetch>, email: string) {
  const sent = await waitFor(async () => http.emails().find((e) => e.to[0] === email));
  return { email: sent, token: sent.text.match(/\/confirm\/([\w-]+)/)![1]! };
}

function postConfirm(token: string, action: "confirm" | "decline") {
  return SELF.fetch(`https://sendm8.test/confirm/${token}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ action }),
  });
}

beforeEach(async () => {
  await db().delete(usageDaily).where(eq(usageDaily.scope, "system_email"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("first submission to an email endpoint", () => {
  it("creates a pending form, stores the message, and emails the owner once", async () => {
    const http = mockFetch();
    const email = uniqueEmail();

    const res = await postForm(email, { name: "Ada", message: "Hi" }, { referer: "https://adas-site.dev/contact" });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/thanks");

    const form = await formFor(email);
    expect(form).toMatchObject({ userId: null, status: "pending_confirmation", name: `Form for ${email}` });
    expect(await listSubmissions(form!.id)).toHaveLength(1);

    const { email: sent } = await confirmationToken(http, email);
    expect(sent.subject).toBe("Confirm form submissions on adas-site.dev");
    expect(sent.text).toContain("1 message is waiting");
    expect(sent.text).toContain(`https://sendm8.test/f/${form!.id}`);

    // More submissions within 24 hours don't send another email.
    await postJson(email, { message: "second" });
    await postJson(encodeURIComponent(email.toUpperCase()), { message: "third, different casing" });
    await new Promise((r) => setTimeout(r, 100));
    expect(http.emails().filter((e) => e.to[0] === email)).toHaveLength(1);
    expect(await listSubmissions(form!.id)).toHaveLength(3);
  });

  it("doesn't create anything for honeypot hits or invalid addresses", async () => {
    const http = mockFetch();
    const email = uniqueEmail();
    await postJson(email, { _gotcha: "bot" });
    expect(await formFor(email)).toBeUndefined();

    const bad = await postJson("not@valid", { a: "b" });
    expect(bad.status).toBe(404);
    expect(http.emails()).toHaveLength(0);
  });

  it("limits how many new endpoints one IP can create per day", async () => {
    mockFetch();
    const ip = "198.51.100.77";
    const statuses: number[] = [];
    for (let i = 0; i < getLimits(env).zeroSignupFormsPerIpPerDay + 1; i++) {
      statuses.push((await postJson(uniqueEmail(), { a: "b" }, { "cf-connecting-ip": ip })).status);
    }
    expect(statuses.slice(0, -1).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("uses the tighter unclaimed monthly quota", async () => {
    mockFetch();
    const email = uniqueEmail();
    await postJson(email, { a: "b" });
    const form = await formFor(email);
    await db().update(usageDaily).set({ submissions: getLimits(env).submissionsPerUnclaimedFormPerMonth }).where(and(eq(usageDaily.scope, "form"), eq(usageDaily.scopeId, form!.id)));
    expect((await postJson(email, { a: "b" })).status).toBe(429);
  });

  it("holds off the confirmation email when the account budget is used up, and retries on the next submission", async () => {
    const http = mockFetch();
    const email = uniqueEmail();
    await db().insert(usageDaily).values({ scope: "system_email", scopeId: "all", day: dayKey(Date.now()), emails: getLimits(env).systemEmailsPerDay });

    await postJson(email, { a: "b" });
    const form = (await formFor(email))!;
    await new Promise((r) => setTimeout(r, 100));
    expect(http.emails()).toHaveLength(0);
    const address = await db().select().from(emailAddresses).where(and(isNull(emailAddresses.userId), eq(emailAddresses.email, email))).get();
    expect(address?.tokenSentAt).toBeNull();

    await db().delete(usageDaily).where(eq(usageDaily.scope, "system_email"));
    expect(await sendOwnerConfirmation(env, form, null)).toBe(true);
    expect(http.emails().filter((e) => e.to[0] === email)).toHaveLength(1);
  });
});

describe("confirming", () => {
  it("activates the form, delivers the backlog, and delivers new submissions instantly", async () => {
    const http = mockFetch();
    const email = uniqueEmail();
    await postJson(email, { message: "waiting one" });
    await postJson(email, { message: "waiting two" });
    const { token } = await confirmationToken(http, email);

    // Viewing the link (e.g. a mail scanner) changes nothing.
    const page = await SELF.fetch(`https://sendm8.test/confirm/${token}`);
    expect(await page.text()).toContain("Yes, deliver them");
    expect((await formFor(email))?.status).toBe("pending_confirmation");

    const confirmed = await postConfirm(token, "confirm");
    expect(confirmed.status).toBe(200);
    expect(await confirmed.text()).toContain("Mail&#39;s on its way");

    const form = (await formFor(email))!;
    expect(form.status).toBe("active");
    const formChannels = await db().select().from(channels).where(eq(channels.formId, form.id)).all();
    expect(formChannels).toMatchObject([{ type: "email", label: email }]);

    await waitFor(async () => http.emails().filter((e) => e.to[0] === email && e.subject.startsWith("New submission")).length === 2);

    const res = await postJson(email, { message: "fresh" });
    const { id } = await res.json<{ id: string }>();
    const delivered = await waitFor(async () => {
      const row = await getSubmission(id);
      return row?.deliveries.length ? row : undefined;
    });
    expect(delivered.deliveries[0]?.status).toBe("sent");

    // Tokens work once.
    expect((await postConfirm(token, "confirm")).status).toBe(400);
  });

  it("delivers to the form id endpoint too once confirmed", async () => {
    const http = mockFetch();
    const email = uniqueEmail();
    await postJson(email, { a: "b" });
    const { token } = await confirmationToken(http, email);
    await postConfirm(token, "confirm");
    const form = (await formFor(email))!;

    await postJson(form.id, { via: "id" });
    await waitFor(async () => http.emails().some((e) => e.to[0] === email && e.text.includes("via")));
  });

  it("'Not me' disables the form, deletes waiting messages, and stops all future email", async () => {
    const http = mockFetch();
    const email = uniqueEmail();
    await postJson(email, { message: "unwanted" });
    const { token } = await confirmationToken(http, email);

    const declined = await postConfirm(token, "decline");
    expect(await declined.text()).toContain("It&#39;s stopped");

    const form = (await formFor(email))!;
    expect(form).toMatchObject({ status: "disabled", flaggedReason: DECLINED_REASON });
    expect(await listSubmissions(form.id)).toHaveLength(0);

    expect((await postJson(email, { message: "again" })).status).toBe(410);
    await new Promise((r) => setTimeout(r, 100));
    expect(http.emails().filter((e) => e.to[0] === email)).toHaveLength(1);
  });

  it("rejects unknown, expired and dashboard tokens", async () => {
    expect((await SELF.fetch("https://sendm8.test/confirm/nope")).status).toBe(400);
    expect((await postConfirm("nope", "decline")).status).toBe(400);

    // A dashboard verification token can't be used on /confirm (and vice versa).
    const http = mockFetch();
    const session = await signIn();
    await api("/emails", { method: "POST", body: { email: "dash@zero.test" }, headers: session.headers });
    const dashToken = http.emails()[0].text.match(/verify\/([\w-]+)/)![1];
    expect((await postConfirm(dashToken, "confirm")).status).toBe(400);

    const email = uniqueEmail();
    await postJson(email, { a: "b" });
    const { token } = await confirmationToken(http, email);
    const verify = await SELF.fetch(`https://sendm8.test/verify/${token}`, { method: "POST" });
    expect(verify.status).toBe(400);
    expect((await formFor(email))?.status).toBe("pending_confirmation");
  });

  it("releases zero-signup submissions that pass a challenge by asking the owner to confirm", async () => {
    const http = mockFetch((req) => (req.url.startsWith("https://challenges.cloudflare.com/") ? Response.json({ success: true, action: "sendm8-challenge" }) : undefined));
    const email = uniqueEmail();
    const res = await postForm(email, { message: "https://a.example https://b.example https://c.example" });
    const id = new URL(res.headers.get("location")!).pathname.split("/")[2]!;
    expect(http.emails()).toHaveLength(0);

    await SELF.fetch(`https://sendm8.test/c/${id}`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "cf-turnstile-response": "tok" }),
    });
    await confirmationToken(http, email);
  });
});

describe("claiming", () => {
  it("moves unclaimed forms into the account when the owner signs in", async () => {
    mockFetch();
    const email = uniqueEmail();
    await postJson(email, { message: "before signup" });

    const owner = await createUser({ email });
    const session = await signIn(owner.id);
    await api("/me", { headers: session.headers });

    const list = await api<Data<FormDto[]>>("/forms", { headers: session.headers });
    expect(list.body.data).toHaveLength(1);
    const [form] = list.body.data;
    expect(form).toMatchObject({ status: "active", emailEndpoint: `https://sendm8.test/f/${email}`, monthlyLimit: 1000 });

    const formChannels = await api<Data<ChannelDto[]>>(`/forms/${form!.id}/channels`, { headers: session.headers });
    expect(formChannels.body.data).toMatchObject([{ type: "email", recipientVerified: true }]);

    // The email endpoint keeps working and now delivers straight away.
    const http = mockFetch();
    await postJson(email, { message: "after signup" });
    await waitFor(async () => http.emails().some((e) => e.to[0] === email));
  });

  it("reuses an address the user already added and re-points the channel", async () => {
    const http = mockFetch();
    const email = uniqueEmail();
    await postJson(email, { a: "b" });
    const { token } = await confirmationToken(http, email);
    await postConfirm(token, "confirm");

    const owner = await createUser({ email });
    const existing = await addAddress(owner.id, email, true);
    const session = await signIn(owner.id);
    await api("/me", { headers: session.headers });

    const addresses = await db().select().from(emailAddresses).where(eq(emailAddresses.email, email)).all();
    expect(addresses.map((a) => a.id)).toEqual([existing.id]);

    const form = (await formFor(email))!;
    expect(form.userId).toBe(owner.id);
    const list = await api<Data<ChannelDto[]>>(`/forms/${form.id}/channels`, { headers: session.headers });
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]?.recipientVerified).toBe(true);
  });

  it("re-opens a form the owner previously declined, but not one an admin disabled", async () => {
    const http = mockFetch();
    const declinedEmail = uniqueEmail();
    await postJson(declinedEmail, { a: "b" });
    await postConfirm((await confirmationToken(http, declinedEmail)).token, "decline");

    const adminEmail = uniqueEmail();
    await postJson(adminEmail, { a: "b" });
    await db().update(forms).set({ status: "disabled", flaggedReason: "phishing" }).where(eq(forms.ownerEmail, adminEmail));

    for (const [email, expected] of [
      [declinedEmail, { status: "active", flaggedReason: null }],
      [adminEmail, { status: "disabled", flaggedReason: "phishing" }],
    ] as const) {
      const owner = await createUser({ email });
      await api("/me", { headers: (await signIn(owner.id)).headers });
      expect(await formFor(email)).toMatchObject({ userId: owner.id, ...expected });
    }
  });

  it("doesn't claim for unverified emails", async () => {
    mockFetch();
    const email = uniqueEmail();
    await postJson(email, { a: "b" });
    const owner = await createUser({ email, emailVerified: false });
    await api("/me", { headers: (await signIn(owner.id)).headers });
    expect((await formFor(email))?.userId).toBeNull();
  });
});
