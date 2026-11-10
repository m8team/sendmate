import type { ChannelDto, FormDto } from "@sendm8/shared";
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLimits } from "../src/config";
import { channels, emailAddresses, forms, submissions, usageDaily } from "../src/db/schema";
import { dayKey } from "../src/lib/time";
import { DECLINED_REASON, sendConfirmationReminders, sendOwnerConfirmation } from "../src/pipeline/zero-signup";
import { addAddress, api, createForm, createUser, db, getSubmission, listSubmissions, mockFetch, postForm, postJson, signIn, waitFor } from "./helpers";

type Data<T> = { data: T };

let counter = 0;
const uniqueEmail = () => `owner${Date.now()}${counter++}@zero-signup.dev`;

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
  it("refuses throwaway inboxes, which anyone can read and so anyone could confirm", async () => {
    const http = mockFetch();
    for (const address of [`dev${counter++}@yopmail.com`, `dev${counter++}@inbox.mailinator.com`]) {
      const res = await postJson(address, { name: "DexSync", message: "You're invited! http://192.168.1.83:5173/register" });
      expect(res.status, address).toBe(400);
      const body = await res.json<{ ok: false; error: { code: string; message: string } }>();
      expect(body.error.code).toBe("disposable_endpoint");
      expect(body.error.message).toContain("an address you own");
      expect(await formFor(address)).toBeUndefined();
    }
    // A plain browser post gets a readable page instead of JSON.
    const page = await postForm(`dev${counter++}@yopmail.com`, { message: "hi" });
    expect(page.status).toBe(400);
    expect(await page.text()).toContain("yopmail.com");

    // Nothing was stored, so no confirmation email went to the throwaway inbox.
    await new Promise((r) => setTimeout(r, 50));
    expect(http.emails().filter((e) => /yopmail|mailinator/.test(e.to[0]))).toHaveLength(0);
  });

  it("refuses reserved domains like example.com, where the confirmation could only bounce", async () => {
    const http = mockFetch();
    for (const address of [`alex${counter++}@example.com`, `dev${counter++}@mail.example.org`, `a${counter++}@site.test`, `b${counter++}@printer.local`]) {
      const res = await postJson(address, { name: "DexSync Invitations", message: "You're invited! http://192.168.1.83:5173/register" });
      expect(res.status, address).toBe(400);
      const body = await res.json<{ ok: false; error: { code: string; message: string } }>();
      expect(body.error.code).toBe("undeliverable_endpoint");
      expect(body.error.message).toContain("reserved");
      expect(await formFor(address)).toBeUndefined();
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(http.emails()).toHaveLength(0);
  });

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

  it("tells whoever posts that delivery waits on the owner's confirmation, without revealing the address", async () => {
    type Pending = { ok: true; id: string; pending?: string; message?: string };
    const http = mockFetch();
    const email = uniqueEmail();
    const masked = `${email[0]}…@zero-signup.dev`;

    const first = await (await postJson(email, { message: "first" })).json<Pending>();
    expect(first).toMatchObject({ ok: true, pending: "confirmation" });
    expect(first.message).toContain(`emailing a confirmation link to ${masked} now`);

    await confirmationToken(http, email);
    const form = (await formFor(email))!;
    const sentAt = (await db().select().from(emailAddresses).where(eq(emailAddresses.email, email)).get())!.tokenSentAt!;
    const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

    // Later posts, by address or by form id, say when the link went and when the next one can.
    for (const endpoint of [email, form.id]) {
      const later = await (await postJson(endpoint, { message: "again" })).json<Pending>();
      expect(later.pending).toBe("confirmation");
      expect(later.message).toContain(`we emailed ${masked} at ${hhmm(sentAt)} UTC`);
      expect(later.message).toContain(`next can go after ${hhmm(sentAt + 24 * 3600_000)} UTC`);
      expect(later.message).not.toContain(email);
    }

    // A browser post lands on the thank-you page, worded for a form that isn't live yet.
    const page = await postForm(email, { message: "from a browser" });
    expect(new URL(page.headers.get("location")!).searchParams.get("pending")).toBe("1");

    // Once confirmed, nothing is pending.
    const { token } = await confirmationToken(http, email);
    await postConfirm(token, "confirm");
    const live = await (await postJson(email, { message: "live" })).json<Pending>();
    expect(live).toEqual({ ok: true, id: live.id });
    const livePage = await postForm(email, { message: "live, from a browser" });
    expect(new URL(livePage.headers.get("location")!).searchParams.has("pending")).toBe(false);
    // Let those deliveries finish here, so they don't land in the next test's mailbox.
    await waitFor(async () => http.emails().find((e) => e.text.includes("live, from a browser")));
  }, 20_000);

  it("sends one reminder when a confirmation goes unanswered for 3 days while messages wait, and never another", async () => {
    const http = mockFetch();
    const day = 24 * 3600_000;
    const ageConfirmation = async (email: string, ms: number) =>
      db().update(emailAddresses).set({ tokenSentAt: Date.now() - ms }).where(eq(emailAddresses.email, email));

    // Waiting 4 days, with a real message from a live site: this one gets reminded.
    const waiting = uniqueEmail();
    await postForm(waiting, { message: "a real enquiry" }, { referer: "https://wedding-rsvp.dev/" });
    await confirmationToken(http, waiting);
    await ageConfirmation(waiting, 4 * day);

    // Too recent, too old, declined, or only spam waiting: none of these.
    const recent = uniqueEmail();
    await postJson(recent, { message: "hi" });
    await confirmationToken(http, recent);
    await ageConfirmation(recent, 1 * day);
    const stale = uniqueEmail();
    await postJson(stale, { message: "hi" });
    await confirmationToken(http, stale);
    await ageConfirmation(stale, 40 * day);
    const declined = uniqueEmail();
    await postJson(declined, { message: "hi" });
    await postConfirm((await confirmationToken(http, declined)).token, "decline");
    await ageConfirmation(declined, 4 * day);
    const onlySpam = uniqueEmail();
    await postJson(onlySpam, { message: "hi" });
    await confirmationToken(http, onlySpam);
    await db().update(submissions).set({ status: "spam" }).where(eq(submissions.formId, (await formFor(onlySpam))!.id));
    await ageConfirmation(onlySpam, 4 * day);

    // Only scripts posted (no website behind it): how sendm8 gets misused to message strangers.
    const scriptOnly = uniqueEmail();
    await postJson(scriptOnly, { message: "Hello support, please look up my account" });
    await confirmationToken(http, scriptOnly);
    await ageConfirmation(scriptOnly, 4 * day);

    // A "website" that claims to be sendm8 itself is a forged Referer: never reminded either.
    const forged = uniqueEmail();
    await postJson(forged, { message: "probe" });
    await confirmationToken(http, forged);
    await db()
      .update(submissions)
      .set({ meta: { ipHash: null, country: null, userAgent: "Mozilla/5.0", referrer: `https://sendm8.test/f/${forged}`, special: {}, spamReasons: [] } })
      .where(eq(submissions.formId, (await formFor(forged))!.id));
    await ageConfirmation(forged, 4 * day);

    const before = http.emails().length;
    expect(await sendConfirmationReminders(env)).toBe(1);
    const reminders = http.emails().slice(before);
    expect(reminders.map((e) => e.to[0])).toEqual([waiting]);
    expect(reminders[0]!.subject).toBe("Still waiting: 1 message on wedding-rsvp.dev");
    expect(reminders[0]!.text).toContain("only reminder");

    // Never a second one, even days later.
    await ageConfirmation(waiting, 5 * day);
    expect(await sendConfirmationReminders(env)).toBe(0);

    // The reminder's link confirms the form and delivers what waited. (Links last 24 hours, so undo
    // the ageing above that proved no second reminder.)
    await ageConfirmation(waiting, 0);
    const token = reminders[0]!.text.match(/\/confirm\/([\w-]+)/)![1]!;
    await postConfirm(token, "confirm");
    expect((await formFor(waiting))?.status).toBe("active");
    await waitFor(async () => http.emails().find((e) => e.to[0] === waiting && e.text.includes("a real enquiry")));
  }, 30_000);

  it("refuses email-endpoint posts that claim to come from sendm8 itself, a forged Referer", async () => {
    const http = mockFetch();
    const forgedHeaders: Record<string, string>[] = [{ referer: "https://sendm8.test/f/x" }, { origin: "https://sendm8.test" }];
    for (const headers of forgedHeaders) {
      const email = uniqueEmail();
      const res = await postJson(email, { name: "Kuroko", subject: "sendm8 -> target", message: "delivery check" }, headers);
      expect(res.status).toBe(400);
      expect((await res.json<{ error: { code: string } }>()).error.code).toBe("invalid_origin");
      expect(await formFor(email)).toBeUndefined();
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(http.emails()).toHaveLength(0);

    // The dashboard's own test send, from sendm8 to a form id, still works.
    const owner = await createUser();
    const form = await createForm({ userId: owner.id });
    expect((await postJson(form.id, { message: "onboarding test" }, { referer: "https://sendm8.test/app/onboarding/" })).status).toBe(200);
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
    await api("/emails", { method: "POST", body: { email: "dash@zero-signup.dev" }, headers: session.headers });
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

  it("delivers what was waiting once a pending form is claimed", async () => {
    mockFetch();
    const email = uniqueEmail();
    await postJson(email, { message: "sent before I signed up" });

    const http = mockFetch();
    const owner = await createUser({ email });
    await api("/me", { headers: (await signIn(owner.id)).headers });
    const sent = await waitFor(async () => http.emails().find((e) => e.to[0] === email && e.text.includes("sent before I signed up")));
    expect(sent).toBeTruthy();
  });

  it("claims forms sent to a +tag of the user's address, which lands in the same inbox", async () => {
    mockFetch();
    const base = uniqueEmail();
    const tagged = base.replace("@", "+folio@");
    await postJson(tagged, { message: "from my portfolio" });

    const http = mockFetch();
    const owner = await createUser({ email: base });
    const session = await signIn(owner.id);
    await api("/me", { headers: session.headers });

    expect(await formFor(tagged)).toMatchObject({ userId: owner.id, status: "active" });
    // The tagged address joins the account as its own verified recipient, and the backlog goes to it.
    const address = await db().select().from(emailAddresses).where(eq(emailAddresses.email, tagged)).get();
    expect(address).toMatchObject({ userId: owner.id });
    expect(address?.verifiedAt).not.toBeNull();
    await waitFor(async () => http.emails().find((e) => e.to[0] === tagged && e.text.includes("from my portfolio")));
  });

  it("never claims someone else's +tag, or a sibling tag of your own", async () => {
    mockFetch();
    const victim = uniqueEmail();
    const theirs = victim.replace("@", "+shop@");
    const sibling = victim.replace("@", "+blog@");
    await postJson(theirs, { a: "b" });
    await postJson(sibling, { a: "b" });
    await postJson(victim, { a: "b" });

    // Same domain, different person. LIKE wildcards in their address mustn't match either.
    for (const email of [victim.replace("owner", "other"), victim.replace("owner", "own_r")]) {
      const someone = await createUser({ email });
      await api("/me", { headers: (await signIn(someone.id)).headers });
    }
    // A tagged sign-in only proves that one tag.
    const tagOwner = await createUser({ email: victim.replace("@", "+other@") });
    await api("/me", { headers: (await signIn(tagOwner.id)).headers });

    for (const email of [theirs, sibling, victim]) expect((await formFor(email))?.userId).toBeNull();
  }, 20_000);

  it("claims forms sent to another address once you verify it in your account, and delivers what waited", async () => {
    mockFetch();
    const siteAddress = uniqueEmail();
    await postJson(siteAddress, { message: "a pledge from the live site" });
    expect(await formFor(siteAddress)).toMatchObject({ userId: null, status: "pending_confirmation" });

    // Signed in with a different address, the dashboard starts empty...
    const owner = await createUser({ email: uniqueEmail() });
    const session = await signIn(owner.id);
    await api("/me", { headers: session.headers });
    expect((await formFor(siteAddress))?.userId).toBeNull();

    // ...until they add and verify the address the form sends to.
    const http = mockFetch();
    await api("/emails", { method: "POST", body: { email: siteAddress }, headers: session.headers });
    const token = (await waitFor(async () => http.emails().find((e) => e.to[0] === siteAddress && /verify\//.test(e.text)))).text.match(/verify\/([\w-]+)/)![1];
    const page = await SELF.fetch(`https://sendm8.test/verify/${token}`, { method: "POST" });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("now in your dashboard");

    expect(await formFor(siteAddress)).toMatchObject({ userId: owner.id, status: "active" });
    await waitFor(async () => http.emails().find((e) => e.to[0] === siteAddress && e.text.includes("a pledge from the live site")));
    // One address row, owned by the user: the zero-signup one was merged into it.
    const rows = await db().select().from(emailAddresses).where(eq(emailAddresses.email, siteAddress)).all();
    expect(rows.map((r) => r.userId)).toEqual([owner.id]);
  });

  it("picks up forms made later for an address you've already verified, on your next visit", async () => {
    mockFetch();
    const owner = await createUser({ email: uniqueEmail() });
    const extra = uniqueEmail();
    await addAddress(owner.id, extra, true);
    const unverified = uniqueEmail();
    await addAddress(owner.id, unverified, false);

    await postJson(extra, { message: "after verifying" });
    await postJson(unverified.replace("@", "+x@"), { message: "not proven yet" });
    await api("/me", { headers: (await signIn(owner.id)).headers });

    expect(await formFor(extra)).toMatchObject({ userId: owner.id, status: "active" });
    // An address that was added but never verified proves nothing.
    expect((await formFor(unverified.replace("@", "+x@")))?.userId).toBeNull();
  }, 20_000);

  it("doesn't claim for unverified emails", async () => {
    mockFetch();
    const email = uniqueEmail();
    await postJson(email, { a: "b" });
    const owner = await createUser({ email, emailVerified: false });
    await api("/me", { headers: (await signIn(owner.id)).headers });
    expect((await formFor(email))?.userId).toBeNull();
  });
});
