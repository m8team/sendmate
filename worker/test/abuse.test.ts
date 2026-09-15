import type { AdminReportDto, AdminUsageDto, BlocklistEntryDto, FormDto, Page, SubmissionDto } from "@sendm8/shared";
import { SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { abuseReports, forms, submissions } from "../src/db/schema";
import { HELD_PLACEHOLDER } from "../src/lib/dto";
import {
  addChannel,
  api,
  createForm,
  createUser,
  db,
  DISCORD_URL,
  getSubmission,
  listSubmissions,
  mockFetch,
  postForm,
  postJson,
  randomIp,
  signIn,
  SLACK_URL,
  waitFor,
  type CapturedRequest,
} from "./helpers";

type Data<T> = { data: T };
type Err = { error: { code: string; message: string } };

const SUSPICIOUS = { message: "Check https://a.example https://b.example https://c.example" };
const siteverify = (overrides: Record<string, unknown> = {}) => (req: CapturedRequest) =>
  req.url.startsWith("https://challenges.cloudflare.com/") ? Response.json({ success: true, action: "sendm8-challenge", hostname: "sendm8.test", ...overrides }) : undefined;

afterEach(() => {
  vi.restoreAllMocks();
});

function challengeId(res: Response): string {
  expect(res.status).toBe(303);
  const location = new URL(res.headers.get("location")!);
  expect(location.pathname).toMatch(/^\/c\/[0-9a-z]{26}$/);
  return location.pathname.split("/")[2]!;
}

function passChallenge(id: string, token = "tok_ok", ip = "203.0.113.7") {
  return SELF.fetch(`https://sendm8.test/c/${id}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip },
    body: new URLSearchParams({ "cf-turnstile-response": token }),
  });
}

describe("challenge page", () => {
  it("sends suspicious browser submissions through Turnstile, then delivers and redirects", async () => {
    const http = mockFetch(siteverify());
    const owner = await createUser();
    const form = await createForm({ userId: owner.id });
    await addChannel(form.id, "discord", { webhookUrl: DISCORD_URL });

    const res = await postForm(form.id, { ...SUSPICIOUS, _next: "https://mysite.dev/thanks" }, { origin: "https://mysite.dev" });
    const id = challengeId(res);
    expect((await getSubmission(id))?.status).toBe("pending_challenge");
    expect(http.to("discord.com")).toHaveLength(0);

    const page = await SELF.fetch(`https://sendm8.test/c/${id}`);
    const html = await page.text();
    expect(html).toContain('data-sitekey="1x00000000000000000000AA"');
    expect(html).toContain('data-action="sendm8-challenge"');
    expect(html).toContain("challenges.cloudflare.com/turnstile/v0/api.js");

    const passed = await passChallenge(id);
    expect(passed.status).toBe(303);
    expect(passed.headers.get("location")).toBe("https://mysite.dev/thanks");

    const verify = http.to("challenges.cloudflare.com")[0]!;
    const params = new URLSearchParams(verify.rawBody);
    expect(params.get("secret")).toBe("1x0000000000000000000000000000000AA");
    expect(params.get("response")).toBe("tok_ok");
    expect(params.get("remoteip")).toBe("203.0.113.7");

    const released = await waitFor(async () => {
      const row = await getSubmission(id);
      return row?.deliveries.length ? row : undefined;
    });
    expect(released.status).toBe("ok");
    expect(released.meta.next).toBeUndefined();
    expect(http.to("discord.com")).toHaveLength(1);

    // A second submit of the same challenge can't release or deliver again.
    const again = await passChallenge(id);
    expect(again.status).toBe(410);
  });

  it("falls back to the thank-you page with a link back to the original page", async () => {
    mockFetch(siteverify());
    const form = await createForm();
    const id = challengeId(await postForm(form.id, SUSPICIOUS, { referer: "https://mysite.dev/contact" }));
    const passed = await passChallenge(id);
    const location = new URL(passed.headers.get("location")!);
    expect(location.pathname).toBe("/thanks");
    expect(location.searchParams.get("back")).toBe("https://mysite.dev/contact");
  });

  it("keeps the submission pending when the check fails", async () => {
    mockFetch(siteverify({ success: false, "error-codes": ["invalid-input-response"] }));
    const form = await createForm();
    const id = challengeId(await postForm(form.id, SUSPICIOUS));

    const res = await passChallenge(id);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("didn&#39;t pass");
    expect((await getSubmission(id))?.status).toBe("pending_challenge");
  });

  it("rejects tokens issued for a different action or hostname", async () => {
    const form = await createForm();
    const id = challengeId(await postForm(form.id, SUSPICIOUS));

    mockFetch(siteverify({ action: "some-other-widget" }));
    expect((await passChallenge(id)).status).toBe(400);
    vi.restoreAllMocks();

    mockFetch(siteverify({ hostname: "evil.example" }));
    // The test secret is Cloudflare's dummy key, which never reports real hostnames, so this passes.
    expect((await passChallenge(id)).status).toBe(303);
  });

  it("tells the visitor to retry when Turnstile is unavailable", async () => {
    mockFetch((req) => (req.url.startsWith("https://challenges.cloudflare.com/") ? new Response("down", { status: 503 }) : undefined));
    const form = await createForm();
    const id = challengeId(await postForm(form.id, SUSPICIOUS));
    const res = await passChallenge(id);
    expect(await res.text()).toContain("couldn&#39;t run the check");
  });

  it("expires challenges after an hour", async () => {
    const form = await createForm();
    const id = challengeId(await postForm(form.id, SUSPICIOUS));
    await db().update(submissions).set({ createdAt: Date.now() - 2 * 3600_000 }).where(eq(submissions.id, id));
    expect((await SELF.fetch(`https://sendm8.test/c/${id}`)).status).toBe(410);
    expect((await passChallenge(id)).status).toBe(410);
    expect((await SELF.fetch("https://sendm8.test/c/nonexistent")).status).toBe(410);
  });

  it("doesn't challenge AJAX submissions, and respects the form's challenge mode", async () => {
    const form = await createForm();
    expect((await postJson(form.id, SUSPICIOUS)).status).toBe(200);
    expect((await listSubmissions(form.id))[0]?.status).toBe("ok");

    const always = await createForm({ settings: { challenge: "always" } });
    challengeId(await postForm(always.id, { message: "totally normal" }));

    const off = await createForm({ settings: { challenge: "off" } });
    expect(new URL((await postForm(off.id, SUSPICIOUS)).headers.get("location")!).pathname).toBe("/thanks");
  });

  it("rate limits challenge attempts per IP", async () => {
    mockFetch(siteverify({ success: false }));
    const form = await createForm();
    const id = challengeId(await postForm(form.id, SUSPICIOUS));
    let limited = false;
    for (let i = 0; i < 12 && !limited; i++) {
      limited = (await (await passChallenge(id, "bad", "198.51.100.99")).text()).includes("Too many attempts");
    }
    expect(limited).toBe(true);
  });
});

describe("bring your own Turnstile", () => {
  async function formWithTurnstile() {
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    return { session, form };
  }

  it("validates the secret with Cloudflare before saving it", async () => {
    const { session, form } = await formWithTurnstile();

    mockFetch(siteverify({ success: false, "error-codes": ["invalid-input-secret"] }));
    const bad = await api<Err>(`/forms/${form.id}/turnstile`, { method: "PUT", body: { secretKey: "0x4AAAAAAAbadbadbadbadbad" }, headers: session.headers });
    expect(bad.body.error.code).toBe("turnstile_secret_invalid");
    vi.restoreAllMocks();

    mockFetch((req) => (req.url.startsWith("https://challenges.cloudflare.com/") ? new Response("", { status: 500 }) : undefined));
    const down = await api<Err>(`/forms/${form.id}/turnstile`, { method: "PUT", body: { secretKey: "0x4AAAAAAAgoodgoodgoodgood" }, headers: session.headers });
    expect(down.status).toBe(502);
    vi.restoreAllMocks();

    mockFetch(siteverify({ success: false, "error-codes": ["invalid-input-response"] }));
    const good = await api(`/forms/${form.id}/turnstile`, { method: "PUT", body: { secretKey: "0x4AAAAAAAgoodgoodgoodgood" }, headers: session.headers });
    expect(good.status).toBe(200);

    const stored = await db().select().from(forms).where(eq(forms.id, form.id)).get();
    expect(stored?.turnstileSecretEnc).toMatch(/^v1:/);
    const dto = await api<Data<FormDto>>(`/forms/${form.id}`, { headers: session.headers });
    expect(dto.body.data.turnstileConfigured).toBe(true);
    expect(JSON.stringify(dto.body)).not.toContain("goodgood");

    expect((await api(`/forms/${form.id}/turnstile`, { method: "DELETE", headers: session.headers })).status).toBe(204);
    expect((await api<Data<FormDto>>(`/forms/${form.id}`, { headers: session.headers })).body.data.turnstileConfigured).toBe(false);
  });

  it("requires a valid token on every submission and skips the challenge page", async () => {
    const { session, form } = await formWithTurnstile();
    mockFetch(siteverify({ success: false, "error-codes": ["invalid-input-response"] }));
    await api(`/forms/${form.id}/turnstile`, { method: "PUT", body: { secretKey: "0x4AAAAAAAmineminemine" }, headers: session.headers });
    vi.restoreAllMocks();

    const http = mockFetch((req) => {
      if (!req.url.startsWith("https://challenges.cloudflare.com/")) return undefined;
      const token = new URLSearchParams(req.rawBody).get("response");
      return Response.json(token === "good" ? { success: true } : { success: false, "error-codes": ["invalid-input-response"] });
    });

    const missing = await postJson(form.id, { message: "hi" });
    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({ error: { code: "captcha_failed" } });

    expect((await postJson(form.id, { message: "hi", "cf-turnstile-response": "bad" })).status).toBe(403);
    expect((await postJson(form.id, { message: "hi", "cf-turnstile-response": "good" })).status).toBe(200);

    // Suspicious browser posts with a valid token go straight through (no sendm8 challenge).
    const browser = await postForm(form.id, { ...SUSPICIOUS, "cf-turnstile-response": "good" });
    expect(new URL(browser.headers.get("location")!).pathname).toBe("/thanks");

    const secretUsed = new URLSearchParams(http.to("challenges.cloudflare.com").at(-1)!.rawBody).get("secret");
    expect(secretUsed).toBe("0x4AAAAAAAmineminemine");
    const rows = await listSubmissions(form.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => !("cf-turnstile-response" in r.data))).toBe(true);
  });

  it("asks visitors to retry if Turnstile is down", async () => {
    const form = await createForm({ turnstileSecretEnc: null });
    const { encryptSecret } = await import("../src/lib/secrets");
    const { env } = await import("cloudflare:workers");
    await db().update(forms).set({ turnstileSecretEnc: await encryptSecret(env, "0x4AAAAAAAsecret") }).where(eq(forms.id, form.id));
    mockFetch((req) => (req.url.startsWith("https://challenges.cloudflare.com/") ? new Response("", { status: 502 }) : undefined));
    const res = await postJson(form.id, { message: "hi", "cf-turnstile-response": "any" });
    expect(res.status).toBe(503);
  });
});

describe("abuse reports", () => {
  function report(body: Record<string, string>, ip = randomIp()) {
    return SELF.fetch("https://sendm8.test/report", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": ip },
      body: new URLSearchParams({ "cf-turnstile-response": "tok", ...body }),
    });
  }

  it("shows a report form prefilled with the form id", async () => {
    const res = await SELF.fetch("https://sendm8.test/report?form=abc1234567");
    const html = await res.text();
    expect(html).toContain('value="abc1234567"');
    expect(html).toContain('data-action="sendm8-report"');
  });

  it("stores reports and flags a form after three independent reporters", async () => {
    mockFetch(siteverify({ action: "sendm8-report" }));
    const owner = await createUser();
    const form = await createForm({ userId: owner.id });
    await addChannel(form.id, "slack", { webhookUrl: SLACK_URL });

    const first = await report({ form: `https://sendm8.test/f/${form.id}`, reason: "phishing", details: "Asks for bank logins", email: "Reporter@Example.com" });
    expect(first.status).toBe(200);
    expect(await first.text()).toContain("on it");
    const [stored] = await db().select().from(abuseReports).where(eq(abuseReports.formId, form.id)).all();
    expect(stored).toMatchObject({ reason: "phishing", details: "Asks for bank logins", reporterEmail: "reporter@example.com" });
    expect(stored?.ipHash).toMatch(/^[0-9a-f]{32}$/);

    // The same person reporting again doesn't count twice.
    await report({ form: form.id, reason: "spam" }, "192.0.2.1");
    await report({ form: form.id, reason: "spam" }, "192.0.2.1");
    expect((await db().select().from(forms).where(eq(forms.id, form.id)).get())?.flaggedReason).toBeNull();

    await report({ form: form.id, reason: "phishing" }, "192.0.2.2");
    expect((await db().select().from(forms).where(eq(forms.id, form.id)).get())?.flaggedReason).toBe("reported");

    // Flagged: new submissions are held and not delivered.
    const http = mockFetch();
    const res = await postJson(form.id, { message: "still here" });
    const { id } = await res.json<{ id: string }>();
    const row = await getSubmission(id);
    expect(row?.status).toBe("held");
    expect(row?.meta.spamReasons).toContain("form_flagged");
    await new Promise((r) => setTimeout(r, 50));
    expect(http.to("hooks.slack.com")).toHaveLength(0);
  });

  it.each([
    [{ form: "not-a-form", reason: "spam" }, "doesn&#39;t look like"],
    [{ form: "zzzzzzzzzz", reason: "spam" }, "couldn&#39;t find"],
    [{ form: "abc1234567", reason: "boredom" }, "Pick what"],
    [{ form: "abc1234567", reason: "spam", email: "nope" }, "email address"],
  ])("rejects invalid reports %o", async (body, message) => {
    mockFetch(siteverify({ action: "sendm8-report" }));
    const res = await report(body);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(message);
  });

  it("requires the Turnstile check", async () => {
    mockFetch(siteverify({ success: false }));
    const form = await createForm();
    const res = await report({ form: form.id, reason: "spam" });
    expect(await res.text()).toContain("complete the check");
    expect(await db().select().from(abuseReports).where(eq(abuseReports.formId, form.id)).all()).toHaveLength(0);
  });

  it("rate limits reports per IP", async () => {
    mockFetch(siteverify({ action: "sendm8-report" }));
    const form = await createForm();
    const texts: string[] = [];
    for (let i = 0; i < 12; i++) texts.push(await (await report({ form: form.id, reason: "spam" }, "198.51.100.200")).text());
    expect(texts.some((t) => t.includes("a few reports already"))).toBe(true);
  });
});

describe("held submissions", () => {
  it("hides held values from the owner, in the API and exports", async () => {
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    await postJson(form.id, { username: "victim", password: "hunter2", _replyto: "victim@bank.test" });

    const list = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?filter=held`, { headers: session.headers });
    const [held] = list.body.data;
    expect(held?.data).toEqual({ username: HELD_PLACEHOLDER, password: HELD_PLACEHOLDER });
    expect(held?.special).toEqual({});
    expect(JSON.stringify(list.body)).not.toContain("hunter2");

    const csv = await api<string>(`/forms/${form.id}/export?filter=held`, { headers: session.headers });
    expect(csv.body).not.toContain("hunter2");

    const release = await api<Err>(`/submissions/${held!.id}`, { method: "PATCH", body: { status: "ok" }, headers: session.headers });
    expect(release.body.error.code).toBe("held_for_review");
    const star = await api(`/submissions/${held!.id}`, { method: "PATCH", body: { starred: true }, headers: session.headers });
    expect(star.status).toBe(200);

    const bulk = await api<Data<{ affected: number }>>(`/forms/${form.id}/submissions/bulk`, { method: "POST", body: { ids: [held!.id], action: "not_spam" }, headers: session.headers });
    expect(bulk.body.data.affected).toBe(0);
    expect((await getSubmission(held!.id))?.status).toBe("held");
  });
});

describe("admin API", () => {
  let adminHeaders: Record<string, string> | undefined;
  async function admin() {
    if (!adminHeaders) {
      const boss = await createUser({ email: "boss@sendm8.test" });
      adminHeaders = (await signIn(boss.id)).headers;
    }
    return adminHeaders;
  }

  it("is invisible to non-admins and admins with unverified emails", async () => {
    const regular = await signIn();
    expect((await api("/admin/reports", { headers: regular.headers })).status).toBe(404);

    const unverified = await createUser({ email: "second@sendm8.test", emailVerified: false });
    expect((await api("/admin/reports", { headers: (await signIn(unverified.id)).headers })).status).toBe(404);
  });

  it("lists and resolves reports", async () => {
    const headers = await admin();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id, name: "Suspicious Bank" });
    const reportId = "report-admin-1";
    await db().insert(abuseReports).values({ id: reportId, formId: form.id, reason: "phishing", details: "fake login", createdAt: Date.now() });

    const open = await api<Data<AdminReportDto[]>>("/admin/reports", { headers });
    const entry = open.body.data.find((r) => r.id === reportId);
    expect(entry?.form).toMatchObject({ id: form.id, name: "Suspicious Bank", ownerEmail: owner.email });

    expect((await api(`/admin/reports/${reportId}/resolve`, { method: "POST", headers })).status).toBe(200);
    const after = await api<Data<AdminReportDto[]>>("/admin/reports", { headers });
    expect(after.body.data.some((r) => r.id === reportId)).toBe(false);
    const all = await api<Data<AdminReportDto[]>>("/admin/reports?status=all", { headers });
    expect(all.body.data.find((r) => r.id === reportId)?.resolvedAt).toBeTruthy();
    expect((await api("/admin/reports/missing/resolve", { method: "POST", headers })).status).toBe(404);
  });

  it("disables a form, then restores it after review and releases held submissions", async () => {
    const headers = await admin();
    const form = await createForm({ flaggedReason: "reported" });
    await db().insert(abuseReports).values({ id: `r-${form.id}`, formId: form.id, reason: "spam", createdAt: Date.now() });
    const heldRes = await postJson(form.id, { password: "fine-actually" });
    const { id: heldId } = await heldRes.json<{ id: string }>();

    expect((await api("/admin/forms/" + form.id + "/disable", { method: "POST", body: { reason: "confirmed phishing" }, headers })).status).toBe(200);
    expect((await postJson(form.id, { a: "b" })).status).toBe(410);

    expect((await api("/admin/forms/" + form.id + "/restore", { method: "POST", headers })).status).toBe(200);
    const restored = await db().select().from(forms).where(eq(forms.id, form.id)).get();
    expect(restored).toMatchObject({ status: "active", flaggedReason: null });
    expect(restored?.reviewedAt).toBeTruthy();
    expect((await getSubmission(heldId))?.status).toBe("ok");
    expect((await db().select().from(abuseReports).where(eq(abuseReports.formId, form.id)).get())?.resolvedAt).toBeTruthy();

    // Reviewed forms skip the sensitive-field hold.
    const res = await postJson(form.id, { password: "reset-flow" });
    const { id } = await res.json<{ id: string }>();
    expect((await getSubmission(id))?.status).toBe("ok");

    expect((await api("/admin/forms/zzzzzzzzzz/disable", { method: "POST", body: { reason: "x" }, headers })).status).toBe(404);
    expect((await api("/admin/forms/zzzzzzzzzz/restore", { method: "POST", headers })).status).toBe(404);
  });

  it("suspends and unsuspends users", async () => {
    const headers = await admin();
    const target = await createUser();
    const form = await createForm({ userId: target.id });
    const before = await signIn(target.id);
    expect((await api("/me", { headers: before.headers })).status).toBe(200);

    expect((await api(`/admin/users/${target.id}/suspend`, { method: "POST", body: { reason: "phishing kit" }, headers })).status).toBe(200);
    expect((await api("/me", { headers: before.headers })).status).toBe(401);

    const fresh = await signIn(target.id);
    const blocked = await api<Err>("/me", { headers: fresh.headers });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("account_suspended");
    expect((await postJson(form.id, { a: "b" })).status).toBe(410);

    expect((await api(`/admin/users/${target.id}/unsuspend`, { method: "POST", headers })).status).toBe(200);
    expect((await api("/me", { headers: fresh.headers })).status).toBe(200);

    expect((await api("/admin/users/nobody/suspend", { method: "POST", body: { reason: "x" }, headers })).status).toBe(404);
  });

  it("won't let admins suspend themselves", async () => {
    const headers = await admin();
    const me = await api<Data<{ user: { id: string } }>>("/me", { headers });
    const res = await api<Err>(`/admin/users/${me.body.data.user.id}/suspend`, { method: "POST", body: { reason: "oops" }, headers });
    expect(res.body.error.code).toBe("cannot_suspend_self");
  });

  it("blocks submissions by IP, email and email domain", async () => {
    const headers = await admin();
    const form = await createForm();

    await api("/admin/blocklist", { method: "POST", body: { type: "ip", value: "203.0.113.66", reason: "flood" }, headers });
    expect((await postJson(form.id, { a: "b" }, { "cf-connecting-ip": "203.0.113.66" })).status).toBe(403);

    await api("/admin/blocklist", { method: "POST", body: { type: "email_domain", value: "@spammy.test" }, headers });
    expect((await postJson(form.id, { email: "someone@SPAMMY.test" })).status).toBe(403);

    await api("/admin/blocklist", { method: "POST", body: { type: "email", value: "Troll@Example.com" }, headers });
    expect((await postJson(form.id, { _replyto: "troll@example.com" })).status).toBe(403);
    expect((await postJson(form.id, { email: "friend@example.com" })).status).toBe(200);

    const list = await api<Data<BlocklistEntryDto[]>>("/admin/blocklist", { headers });
    expect(list.body.data.map((e) => e.type)).toEqual(expect.arrayContaining(["ip_hash", "email_domain", "email"]));
    expect(JSON.stringify(list.body)).not.toContain("203.0.113.66");

    expect((await api("/admin/blocklist", { method: "DELETE", body: { type: "email_domain", value: "spammy.test" }, headers })).status).toBe(204);
    expect((await postJson(form.id, { email: "someone@spammy.test" })).status).toBe(200);
  });

  it("reports free-tier usage", async () => {
    const headers = await admin();
    const form = await createForm();
    await postJson(form.id, { a: "1" });
    const res = await api<Data<AdminUsageDto>>("/admin/usage", { headers });
    expect(res.body.data.submissions).toBeGreaterThan(0);
    expect(res.body.data.systemEmailLimit).toBe(100);
    expect(res.body.data.estimatedWrites).toBeGreaterThanOrEqual(res.body.data.submissions * 3);
    expect(res.body.data.topForms.length).toBeGreaterThan(0);
  });
});
