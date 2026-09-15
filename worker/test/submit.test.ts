import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { usageDaily } from "../src/db/schema";
import { dayKey } from "../src/lib/time";
import { createForm, db, listSubmissions, postForm, postJson } from "./helpers";

describe("POST /f/:formId", () => {
  it("stores a plain HTML form post and redirects to the thank-you page", async () => {
    const form = await createForm();
    const res = await postForm(form.id, { name: "Jess", email: "jess@example.com", interests: ["forms", "mates"] }, { referer: "https://jess.dev/contact" });

    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/thanks");
    expect(location.searchParams.get("back")).toBe("https://jess.dev/contact");

    const [row] = await listSubmissions(form.id);
    expect(row?.data).toEqual({ name: "Jess", email: "jess@example.com", interests: ["forms", "mates"] });
    expect(row?.status).toBe("ok");
    expect(row?.meta.ipHash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("accepts JSON and responds with JSON + CORS", async () => {
    const form = await createForm();
    const res = await postJson(form.id, { email: "a@b.co", count: 3, tags: ["x", "y"], nested: { a: 1 } }, { origin: "https://site.com" });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://site.com");
    const body = await res.json<{ ok: boolean; id: string }>();
    expect(body.ok).toBe(true);

    const [row] = await listSubmissions(form.id);
    expect(row?.id).toBe(body.id);
    expect(row?.data).toEqual({ email: "a@b.co", count: "3", tags: ["x", "y"], nested: '{"a":1}' });
  });

  it("accepts multipart form data, keeping files out of the field data", async () => {
    const form = await createForm();
    const data = new FormData();
    data.append("message", "hello");
    data.append("attachment", new File(["abc"], "a.txt"));
    const res = await SELF.fetch(`https://sendm8.test/f/${form.id}`, { method: "POST", body: data, redirect: "manual", headers: { accept: "application/json" } });

    expect(res.status).toBe(200);
    const [row] = await listSubmissions(form.id);
    expect(row?.data).toEqual({ message: "hello" });
    expect(row?.meta.files).toMatchObject([{ field: "attachment", name: "a.txt", size: 3 }]);
  });

  it("supports Formspree special fields and strips them from data", async () => {
    const form = await createForm();
    const res = await postForm(
      form.id,
      { email: "a@b.co", _subject: "New lead", _replyto: "a@b.co", _next: "https://mysite.com/thanks", "cf-turnstile-response": "tok" },
      { origin: "https://mysite.com" },
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://mysite.com/thanks");
    const [row] = await listSubmissions(form.id);
    expect(row?.data).toEqual({ email: "a@b.co" });
    expect(row?.meta.special).toEqual({ _subject: "New lead", _replyto: "a@b.co" });
  });

  it("refuses _next redirects to other sites (no open redirect)", async () => {
    const form = await createForm();
    const res = await postForm(form.id, { email: "a@b.co", _next: "https://evil.example/phish" }, { origin: "https://mysite.com" });

    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/thanks");
  });

  it("uses the form's configured redirect URL", async () => {
    const form = await createForm({ redirectUrl: "https://owner.site/done" });
    const res = await postForm(form.id, { email: "a@b.co" });
    expect(res.headers.get("location")).toBe("https://owner.site/done");
  });

  it("returns 404 for unknown forms", async () => {
    const res = await postJson("zzzzzzzzzz", { a: "b" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "form_not_found" } });
  });

  it("renders an HTML error page for browser posts", async () => {
    const res = await postForm("zzzzzzzzzz", { a: "b" });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("doesn&#39;t exist");
  });

  it("rejects disabled and paused forms", async () => {
    const disabled = await createForm({ status: "disabled" });
    const paused = await createForm({ status: "paused" });
    expect((await postJson(disabled.id, { a: "b" })).status).toBe(410);
    expect((await postJson(paused.id, { a: "b" })).status).toBe(423);
  });

  it("enforces allowed origins", async () => {
    const form = await createForm({ allowedOrigins: ["mysite.com"] });

    expect((await postJson(form.id, { a: "b" }, { origin: "https://www.mysite.com" })).status).toBe(200);
    expect((await postJson(form.id, { a: "b" }, { origin: "https://notmysite.com" })).status).toBe(403);
    expect((await postJson(form.id, { a: "b" })).status).toBe(403);
    expect(await listSubmissions(form.id)).toHaveLength(1);
  });

  it("silently drops honeypot submissions without storing them", async () => {
    const form = await createForm();
    const res = await postJson(form.id, { email: "bot@spam.co", _gotcha: "gotcha" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(await listSubmissions(form.id)).toHaveLength(0);
  });

  it("honours a custom honeypot field name", async () => {
    const form = await createForm({ settings: { honeypotField: "website" } });
    await postJson(form.id, { email: "human@site.co", website: "" });
    await postJson(form.id, { email: "bot@spam.co", website: "http://spam" });

    const rows = await listSubmissions(form.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toEqual({ email: "human@site.co" });
  });

  it("holds submissions from forms that look like phishing", async () => {
    const form = await createForm();
    await postJson(form.id, { username: "victim", password: "hunter2" });
    const [row] = await listSubmissions(form.id);
    expect(row?.status).toBe("held");
    expect(row?.meta.spamReasons).toEqual(["sensitive_field:password"]);
  });

  it("stores obvious spam as spam", async () => {
    const form = await createForm();
    await postJson(form.id, {
      message: "Best SEO services and backlinks! http://a.co http://b.co http://c.co [url=http://d.co]casino[/url]",
    });
    const [row] = await listSubmissions(form.id);
    expect(row?.status).toBe("spam");
    expect(row?.spamScore).toBeGreaterThanOrEqual(0.8);
  });

  it("does not flag an ordinary message with a link", async () => {
    const form = await createForm();
    await postJson(form.id, { message: "Hey! Loved your post at https://blog.site/post. Want to collaborate?" });
    const [row] = await listSubmissions(form.id);
    expect(row?.status).toBe("ok");
  });

  it("enforces the monthly quota", async () => {
    const form = await createForm();
    await db().insert(usageDaily).values({ scope: "form", scopeId: form.id, day: dayKey(Date.now()), submissions: 1000 });

    const res = await postJson(form.id, { a: "b" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: "quota_exceeded" } });
  });

  it("counts submissions towards usage", async () => {
    const form = await createForm();
    await postJson(form.id, { a: "1" });
    await postJson(form.id, { a: "2" });
    const rows = await db().select().from(usageDaily).all();
    expect(rows.find((r) => r.scopeId === form.id)?.submissions).toBe(2);
  });

  it("rejects oversized bodies and fields", async () => {
    const form = await createForm();
    expect((await postJson(form.id, { message: "x".repeat(70 * 1024) })).status).toBe(413);
    expect((await postJson(form.id, { message: "x".repeat(11 * 1024) })).status).toBe(413);
    expect(await listSubmissions(form.id)).toHaveLength(0);
  });

  it("rejects invalid JSON and too many fields", async () => {
    const form = await createForm();
    const bad = await SELF.fetch(`https://sendm8.test/f/${form.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" });
    expect(bad.status).toBe(400);

    const many = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`f${i}`, "v"]));
    expect((await postJson(form.id, many)).status).toBe(400);
  });

  it("answers CORS preflight", async () => {
    const res = await SELF.fetch("https://sendm8.test/f/abcdefghjk", { method: "OPTIONS", headers: { origin: "https://site.com" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});
