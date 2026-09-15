import type { ChannelDto, EmailAddressDto, FormDto, MeDto, Page, SubmissionDto } from "@sendm8/shared";
import { LIMITS } from "@sendm8/shared";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { submissions, userSettings } from "../src/db/schema";
import { encryptSecret } from "../src/lib/secrets";
import { idFragment } from "../src/routes/api/forms";
import { addAddress, addChannel, api, createForm, db, getSubmission, mockFetch, postJson, signIn, SLACK_URL, waitFor } from "./helpers";

type Data<T> = { data: T };
type Err = { error: { code: string; message: string } };

afterEach(() => {
  vi.restoreAllMocks();
});

async function ownedForm(settings = {}) {
  const session = await signIn();
  const form = await createForm({ userId: session.userId, settings });
  return { session, form };
}

describe("forms API additions", () => {
  it("treats an empty PATCH as a no-op and clears settings with null", async () => {
    const { session, form } = await ownedForm({ honeypotField: "website", notifyMode: "digest" });
    const empty = await api<Data<FormDto>>(`/forms/${form.id}`, { method: "PATCH", body: {}, headers: session.headers });
    expect(empty.status).toBe(200);
    expect(empty.body.data.name).toBe(form.name);

    const cleared = await api<Data<FormDto>>(`/forms/${form.id}`, { method: "PATCH", body: { settings: { honeypotField: null } }, headers: session.headers });
    expect(cleared.body.data.settings).toEqual({ notifyMode: "digest" });
  });

  it("returns folder counts on the single-form endpoint", async () => {
    const { session, form } = await ownedForm({ notifyMode: "off" });
    await postJson(form.id, { message: "hello" });
    await postJson(form.id, { message: "hello again" });
    await postJson(form.id, { password: "hunter2" });
    await postJson(form.id, { message: "SEO services backlinks casino http://a.co http://b.co http://c.co [url=http://d.co]x[/url]" });
    const list = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions`, { headers: session.headers });
    await api(`/submissions/${list.body.data[0]!.id}`, { method: "PATCH", body: { starred: true }, headers: session.headers });

    const res = await api<Data<FormDto>>(`/forms/${form.id}`, { headers: session.headers });
    expect(res.body.data.counts).toEqual({ inbox: 2, spam: 1, held: 1, starred: 1, total: 4 });
    const all = await api<Data<FormDto[]>>("/forms", { headers: session.headers });
    expect(all.body.data[0]?.counts).toBeUndefined();
  });

  it("searches by submission id and tracking number", async () => {
    const { session, form } = await ownedForm({ notifyMode: "off" });
    const res = await postJson(form.id, { message: "needle in the haystack" });
    const { id } = await res.json<{ id: string }>();
    await postJson(form.id, { message: "something else" });

    const tail = id.slice(-10).toUpperCase();
    const tracking = `SM8 ${tail.slice(0, 4)} ${tail.slice(4, 8)} ${tail.slice(8)}`;
    for (const q of [tracking, id, tail.toLowerCase()]) {
      const found = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?filter=all&q=${encodeURIComponent(q)}`, { headers: session.headers });
      expect(found.body.data.map((s) => s.id), q).toEqual([id]);
    }
    expect(idFragment("hello")).toBeNull();
    expect(idFragment("SM8 7Q2K 9F4X 3M")).toBe("7q2k9f4x3m");
  });

  it("exports CSV pages with stable columns and respects search", async () => {
    const { session, form } = await ownedForm({ notifyMode: "off" });
    await postJson(form.id, { name: "Ada" });
    await postJson(form.id, { name: "Grace", company: "Navy" });

    const csv = await api<string>(`/forms/${form.id}/export?format=csv`, { headers: session.headers });
    const [header, ...rows] = csv.body.trim().split("\r\n");
    expect(header).toBe("id,created_at,status,name,company");
    expect(rows.every((r) => r.split(",").length === 5)).toBe(true);

    // A later page (simulated with a cursor) keeps the same columns even if its rows lack a field.
    const newest = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?limit=1`, { headers: session.headers });
    const page2 = await api<string>(`/forms/${form.id}/export?format=csv&cursor=${newest.body.data[0]!.id}`, { headers: session.headers });
    expect(page2.body.trim().split(",")).toHaveLength(5);

    const searched = await api<{ data: SubmissionDto[] }>(`/forms/${form.id}/export?format=json&q=Grace`, { headers: session.headers });
    expect(searched.body.data.map((s) => s.data.name)).toEqual(["Grace"]);
  });

  it("returns the full effective limits", async () => {
    const session = await signIn();
    const me = await api<Data<MeDto>>("/me", { headers: session.headers });
    expect(me.body.data.limits).toEqual(LIMITS);
  });
});

describe("submission actions", () => {
  it("delivers a submission rescued from spam, once", async () => {
    const http = mockFetch();
    const { session, form } = await ownedForm();
    await addChannel(form.id, "slack", { webhookUrl: SLACK_URL });
    const res = await postJson(form.id, { message: "SEO services backlinks casino http://a.co http://b.co http://c.co [url=http://d.co]x[/url]" });
    const { id } = await res.json<{ id: string }>();
    expect((await getSubmission(id))?.status).toBe("spam");

    await api(`/submissions/${id}`, { method: "PATCH", body: { status: "ok" }, headers: session.headers });
    await waitFor(async () => ((await getSubmission(id))?.deliveries.length ? true : undefined));
    expect(http.to("hooks.slack.com")).toHaveLength(1);

    // Moving it to spam and back again doesn't re-deliver.
    await api(`/submissions/${id}`, { method: "PATCH", body: { status: "spam" }, headers: session.headers });
    await api(`/submissions/${id}`, { method: "PATCH", body: { status: "ok" }, headers: session.headers });
    await new Promise((r) => setTimeout(r, 50));
    expect(http.to("hooks.slack.com")).toHaveLength(1);
  });

  it("delivers bulk-rescued submissions", async () => {
    const http = mockFetch();
    const { session, form } = await ownedForm();
    await addChannel(form.id, "slack", { webhookUrl: SLACK_URL });
    const spammy = { message: "SEO services backlinks casino http://a.co http://b.co http://c.co [url=http://d.co]x[/url]" };
    const ids = await Promise.all([postJson(form.id, spammy), postJson(form.id, spammy)].map(async (r) => (await (await r).json<{ id: string }>()).id));

    await api(`/forms/${form.id}/submissions/bulk`, { method: "POST", body: { ids, action: "not_spam" }, headers: session.headers });
    await waitFor(async () => (http.to("hooks.slack.com").length === 2 ? true : undefined));
  });

  it("retries failed deliveries on demand", async () => {
    let down = true;
    const http = mockFetch((req) => (req.url.startsWith("https://hooks.slack.com") && down ? new Response("down", { status: 500 }) : undefined));
    const { session, form } = await ownedForm();
    await addChannel(form.id, "slack", { webhookUrl: SLACK_URL });
    const res = await postJson(form.id, { message: "hi" });
    const { id } = await res.json<{ id: string }>();
    const failed = await waitFor(async () => {
      const row = await getSubmission(id);
      return row?.deliveries.length ? row : undefined;
    });
    expect(failed.deliveries[0]?.status).toBe("failed");

    const list = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions`, { headers: session.headers });
    expect(list.body.data[0]?.retryAt).toBe(failed.retryAt);

    down = false;
    const retried = await api<Data<SubmissionDto>>(`/submissions/${id}/retry`, { method: "POST", headers: session.headers });
    expect(retried.status).toBe(200);
    expect(retried.body.data.deliveries[0]).toMatchObject({ status: "sent", attempts: 1 });
    expect(retried.body.data.retryAt).toBeNull();
    expect(http.to("hooks.slack.com")).toHaveLength(2);

    const again = await api<Err>(`/submissions/${id}/retry`, { method: "POST", headers: session.headers });
    expect(again.body.error.code).toBe("nothing_to_retry");

    await db().update(submissions).set({ status: "spam" }).where(eq(submissions.id, id));
    expect((await api<Err>(`/submissions/${id}/retry`, { method: "POST", headers: session.headers })).body.error.code).toBe("not_deliverable");
  });
});

describe("channel and address additions", () => {
  it("supports custom labels and remembers test results", async () => {
    let fail = false;
    mockFetch((req) => (req.url.startsWith("https://hooks.slack.com") && fail ? new Response("channel_is_archived", { status: 410 }) : undefined));
    const { session, form } = await ownedForm();

    const created = await api<Data<ChannelDto>>(`/forms/${form.id}/channels`, { method: "POST", body: { type: "slack", webhookUrl: SLACK_URL, label: "#leads" }, headers: session.headers });
    expect(created.body.data).toMatchObject({ label: "#leads", lastTest: null });

    const renamed = await api<Data<ChannelDto>>(`/channels/${created.body.data.id}`, { method: "PATCH", body: { label: "#sales" }, headers: session.headers });
    expect(renamed.body.data.label).toBe("#sales");
    expect((await api(`/channels/${created.body.data.id}`, { method: "PATCH", body: {}, headers: session.headers })).status).toBe(422);

    await api(`/channels/${created.body.data.id}/test`, { method: "POST", headers: session.headers });
    fail = true;
    await api(`/channels/${created.body.data.id}/test`, { method: "POST", headers: session.headers });

    const list = await api<Data<ChannelDto[]>>(`/forms/${form.id}/channels`, { headers: session.headers });
    expect(list.body.data[0]?.lastTest).toMatchObject({ ok: false, message: expect.stringContaining("channel_is_archived") });
  });

  it("includes verification timestamps on addresses", async () => {
    mockFetch();
    const session = await signIn();
    const verified = await addAddress(session.userId, "done@gaps.test", true);
    await api("/emails", { method: "POST", body: { email: "pending@gaps.test" }, headers: session.headers });
    const list = await api<Data<EmailAddressDto[]>>("/emails", { headers: session.headers });
    expect(list.body.data.find((a) => a.id === verified.id)?.verifiedAt).toBe(verified.verifiedAt);
    const pending = list.body.data.find((a) => a.email === "pending@gaps.test");
    expect(pending).toMatchObject({ verifiedAt: null, verificationSentAt: expect.any(Number) });
  });
});

describe("Resend sender changes", () => {
  const domains = () => Response.json({ data: [{ name: "me.dev", status: "verified" }, { name: "new.dev", status: "verified" }, { name: "pending.dev", status: "pending" }] });

  async function withKey() {
    const session = await signIn();
    await db()
      .insert(userSettings)
      .values({ userId: session.userId, resendKeyEnc: await encryptSecret(env, "re_stored_key_1234"), resendKeyHint: "re_••••1234", resendFrom: "Me <hi@me.dev>", resendKeyError: "old error" });
    return session;
  }

  it("changes the from address using the stored key and lists verified domains", async () => {
    const http = mockFetch((req) => (req.url.endsWith("/domains") ? domains() : undefined));
    const session = await withKey();

    const listed = await api<Data<{ domains: string[]; restricted: boolean }>>("/settings/resend/domains", { headers: session.headers });
    expect(listed.body.data).toEqual({ restricted: false, domains: ["me.dev", "new.dev"] });
    expect(http.requests[0]!.headers.get("authorization")).toBe("Bearer re_stored_key_1234");

    const changed = await api<Data<{ from: string }>>("/settings/resend", { method: "PATCH", body: { from: "Sales <sales@new.dev>" }, headers: session.headers });
    expect(changed.body.data.from).toBe("Sales <sales@new.dev>");
    const row = await db().select().from(userSettings).where(eq(userSettings.userId, session.userId)).get();
    expect(row).toMatchObject({ resendFrom: "Sales <sales@new.dev>", resendKeyError: null });

    const unverified = await api<Err>("/settings/resend", { method: "PATCH", body: { from: "x@pending.dev" }, headers: session.headers });
    expect(unverified.status).toBe(422);
    expect((await api("/settings/resend", { method: "PATCH", body: { from: "nope" }, headers: session.headers })).status).toBe(422);
  });

  it("needs a stored key and reports Resend outages", async () => {
    const fresh = await signIn();
    expect((await api<Err>("/settings/resend/domains", { headers: fresh.headers })).body.error.code).toBe("resend_not_configured");

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("down"));
    const session = await withKey();
    expect((await api("/settings/resend/domains", { headers: session.headers })).status).toBe(502);
  });
});
