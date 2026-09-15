import type { DailyStat, FormDto, MeDto, Page, SubmissionDto } from "@sendm8/shared";
import { describe, expect, it } from "vitest";
import { api, createForm, postJson, signIn } from "./helpers";

type Data<T> = { data: T };
type Err = { error: { code: string; message: string } };

describe("auth & CSRF", () => {
  it("rejects unauthenticated requests", async () => {
    const { status, body } = await api<Err>("/me");
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
  });

  it("rejects forged session cookies", async () => {
    const { status } = await api("/me", { headers: { cookie: "__Secure-sendm8.session_token=abc.def" } });
    expect(status).toBe(401);
  });

  it("returns the signed-in user", async () => {
    const session = await signIn();
    const { status, body } = await api<Data<MeDto>>("/me", { headers: session.headers });
    expect(status).toBe(200);
    expect(body.data.user.id).toBe(session.userId);
    expect(body.data.limits.submissionsPerFormPerMonth).toBe(1000);
  });

  it("blocks cross-site state changes", async () => {
    const session = await signIn();
    const { status } = await api<Err>("/forms", {
      method: "POST",
      body: { name: "Evil" },
      headers: { ...session.headers, origin: "https://evil.example" },
    });
    expect(status).toBe(403);
  });
});

describe("forms API", () => {
  it("creates, lists, updates and deletes forms", async () => {
    const session = await signIn();

    const created = await api<Data<FormDto>>("/forms", {
      method: "POST",
      body: { name: "Contact", allowedOrigins: ["https://www.MySite.com/contact", "*.other.dev"] },
      headers: session.headers,
    });
    expect(created.status).toBe(201);
    const form = created.body.data;
    expect(form.id).toMatch(/^[0-9a-z]{10}$/);
    expect(form.endpoint).toBe(`https://sendm8.test/f/${form.id}`);
    expect(form.allowedOrigins).toEqual(["www.mysite.com", "*.other.dev"]);

    const list = await api<Data<FormDto[]>>("/forms", { headers: session.headers });
    expect(list.body.data.map((f) => f.id)).toEqual([form.id]);

    const updated = await api<Data<FormDto>>(`/forms/${form.id}`, {
      method: "PATCH",
      body: { name: "Renamed", status: "paused", settings: { honeypotField: "website" } },
      headers: session.headers,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: "Renamed", status: "paused", settings: { honeypotField: "website" } });

    const deleted = await api(`/forms/${form.id}`, { method: "DELETE", headers: session.headers });
    expect(deleted.status).toBe(204);
    expect((await api(`/forms/${form.id}`, { headers: session.headers })).status).toBe(404);
  });

  it("validates input", async () => {
    const session = await signIn();
    const bad = [{ name: "" }, { name: "x", redirectUrl: "javascript:alert(1)" }, { name: "x", allowedOrigins: ["not a host"] }, { name: "x", settings: { honeypotField: "_gotcha" } }];
    for (const body of bad) {
      const res = await api<Err>("/forms", { method: "POST", body, headers: session.headers });
      expect(res.status, JSON.stringify(body)).toBe(422);
    }
  });

  it("never exposes another user's forms", async () => {
    const alice = await signIn();
    const bob = await signIn();
    const form = await createForm({ userId: alice.userId });

    expect((await api(`/forms/${form.id}`, { headers: bob.headers })).status).toBe(404);
    expect((await api(`/forms/${form.id}`, { method: "PATCH", body: { name: "pwned" }, headers: bob.headers })).status).toBe(404);
    expect((await api(`/forms/${form.id}`, { method: "DELETE", headers: bob.headers })).status).toBe(404);
    expect((await api(`/forms/${form.id}/submissions`, { headers: bob.headers })).status).toBe(404);
    expect((await api<Data<FormDto[]>>("/forms", { headers: bob.headers })).body.data).toEqual([]);
  });

  it("does not let owners re-enable a disabled form", async () => {
    const session = await signIn();
    const form = await createForm({ userId: session.userId, status: "disabled" });
    const res = await api<Err>(`/forms/${form.id}`, { method: "PATCH", body: { status: "active" }, headers: session.headers });
    expect(res.status).toBe(403);
  });

  it("reports usage and last submission time", async () => {
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    await postJson(form.id, { a: "1" });
    await postJson(form.id, { a: "2" });

    const { body } = await api<Data<FormDto>>(`/forms/${form.id}`, { headers: session.headers });
    expect(body.data.submissionsThisMonth).toBe(2);
    expect(body.data.lastSubmissionAt).toBeGreaterThan(Date.now() - 60_000);

    const stats = await api<Data<DailyStat[]>>(`/forms/${form.id}/stats?days=7`, { headers: session.headers });
    expect(stats.body.data).toHaveLength(7);
    expect(stats.body.data.at(-1)?.submissions).toBe(2);
  });
});

describe("submissions API", () => {
  async function seeded() {
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    for (let i = 0; i < 5; i++) await postJson(form.id, { name: `Person ${i}`, message: i === 2 ? "needle_100%" : "hello" });
    await postJson(form.id, { message: "Best SEO services backlinks casino http://a.co http://b.co http://c.co" });
    return { session, form };
  }

  it("paginates the inbox newest-first with cursors", async () => {
    const { session, form } = await seeded();

    const first = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?limit=3`, { headers: session.headers });
    expect(first.body.data.map((s) => s.data.name)).toEqual(["Person 4", "Person 3", "Person 2"]);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?limit=3&cursor=${first.body.nextCursor}`, { headers: session.headers });
    expect(second.body.data.map((s) => s.data.name)).toEqual(["Person 1", "Person 0"]);
    expect(second.body.nextCursor).toBeNull();
    expect(JSON.stringify(second.body)).not.toContain("ipHash");
  });

  it("filters spam and searches with literal wildcards", async () => {
    const { session, form } = await seeded();

    const spam = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?filter=spam`, { headers: session.headers });
    expect(spam.body.data).toHaveLength(1);

    const found = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?filter=all&q=${encodeURIComponent("needle_100%")}`, { headers: session.headers });
    expect(found.body.data.map((s) => s.data.name)).toEqual(["Person 2"]);

    const wildcard = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?filter=all&q=%25`, { headers: session.headers });
    expect(wildcard.body.data).toHaveLength(1);
  });

  it("stars, marks spam, deletes, and bulk-updates", async () => {
    const { session, form } = await seeded();
    const inbox = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions`, { headers: session.headers });
    const [a, b, c] = inbox.body.data;

    const starred = await api<Data<SubmissionDto>>(`/submissions/${a!.id}`, { method: "PATCH", body: { starred: true }, headers: session.headers });
    expect(starred.body.data.starred).toBe(true);

    await api(`/submissions/${b!.id}`, { method: "PATCH", body: { status: "spam" }, headers: session.headers });
    expect((await api(`/submissions/${c!.id}`, { method: "DELETE", headers: session.headers })).status).toBe(204);

    const bulk = await api<Data<{ affected: number }>>(`/forms/${form.id}/submissions/bulk`, {
      method: "POST",
      body: { ids: [a!.id, "not-a-real-id"], action: "spam" },
      headers: session.headers,
    });
    expect(bulk.body.data.affected).toBe(1);

    const starredList = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?filter=starred`, { headers: session.headers });
    expect(starredList.body.data.map((s) => s.id)).toEqual([a!.id]);
    const spam = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions?filter=spam`, { headers: session.headers });
    expect(spam.body.data).toHaveLength(3);
  });

  it("does not let other users touch submissions", async () => {
    const { form, session } = await seeded();
    const bob = await signIn();
    const inbox = await api<Page<SubmissionDto>>(`/forms/${form.id}/submissions`, { headers: session.headers });
    const id = inbox.body.data[0]!.id;

    expect((await api(`/submissions/${id}`, { headers: bob.headers })).status).toBe(404);
    expect((await api(`/submissions/${id}`, { method: "DELETE", headers: bob.headers })).status).toBe(404);
    const bulk = await api(`/forms/${form.id}/submissions/bulk`, { method: "POST", body: { ids: [id], action: "delete" }, headers: bob.headers });
    expect(bulk.status).toBe(404);
  });

  it("exports CSV safely", async () => {
    const session = await signIn();
    const form = await createForm({ userId: session.userId, name: "My Form" });
    await postJson(form.id, { name: "=HYPERLINK(\"http://evil\")", note: 'said "hi", then left' });

    const { res, body } = await api<string>(`/forms/${form.id}/export?format=csv`, { headers: session.headers });
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("my-form-");
    const [header, row] = body.trim().split("\r\n");
    expect(header).toBe("id,created_at,status,name,note");
    expect(row).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(row).toContain('"said ""hi"", then left"');
  });
});
