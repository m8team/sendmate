import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminGrowthDto, AdminHostsDto, FormDto, MeDto } from "@sendm8/shared";
import { submissions, user, userSettings } from "../src/db/schema";
import worker from "../src/index";
import { newId } from "../src/lib/ids";
import { api, createForm, createUser, db, mockFetch, signIn, waitFor } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const meta = { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] };

async function adminHeaders() {
  const existing = await db().select().from(user).where(eq(user.email, "boss@sendm8.test")).get();
  const boss = existing ?? (await createUser({ email: "boss@sendm8.test" }));
  return (await signIn(boss.id)).headers;
}

describe("how did you hear about sendm8?", () => {
  it("is unanswered until asked, then remembers the answer and alerts", async () => {
    const http = mockFetch();
    const { headers, userId } = await signIn();
    expect((await api<{ data: MeDto }>("/me", { headers })).body.data.heardFrom).toBeNull();

    const res = await api("/settings/heard-from", { method: "PUT", headers, body: { source: "ai_assistant", detail: "  Claude suggested it  " } });
    expect(res.status).toBe(200);
    expect((await api<{ data: MeDto }>("/me", { headers })).body.data.heardFrom).toBe("ai_assistant");
    expect(await db().select().from(userSettings).where(eq(userSettings.userId, userId)).get()).toMatchObject({ heardFrom: "ai_assistant", heardFromDetail: "Claude suggested it" });

    const alert = await waitFor(async () =>
      http.to("alerts.example.com").map((r) => r.body as { embeds: { title: string; description?: string }[] }).find((b) => b.embeds[0]!.title.includes("found sendm8 via ai assistant")),
    );
    expect(alert.embeds[0]!.description).toBe("“Claude suggested it”");
  });

  it("can be skipped, which is remembered without an alert or a stored note", async () => {
    const http = mockFetch();
    const { headers, userId } = await signIn();
    expect((await api("/settings/heard-from", { method: "PUT", headers, body: { source: "skipped", detail: "ignored" } })).status).toBe(200);
    expect((await api<{ data: MeDto }>("/me", { headers })).body.data.heardFrom).toBe("skipped");
    expect((await db().select().from(userSettings).where(eq(userSettings.userId, userId)).get())?.heardFromDetail).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(http.to("alerts.example.com").filter((r) => JSON.stringify(r.body).includes("found sendm8"))).toHaveLength(0);
  });

  it("rejects answers that aren't on the list", async () => {
    const { headers } = await signIn();
    expect((await api("/settings/heard-from", { method: "PUT", headers, body: { source: "tiktok" } })).status).toBe(422);
    expect((await api("/settings/heard-from", { method: "PUT", headers, body: { source: "other", detail: "x".repeat(201) } })).status).toBe(422);
  });
});

describe("spam this week", () => {
  it("counts what the filters binned in the last 7 days, not what the owner moved", async () => {
    const session = await signIn();
    const form = await createForm({ userId: session.userId });
    const now = Date.now();
    await db()
      .insert(submissions)
      .values([
        { id: newId(), formId: form.id, data: {}, meta, status: "spam", spamScore: 0.9, createdAt: now - 3_600_000 },
        { id: newId(), formId: form.id, data: {}, meta, status: "spam", spamScore: 1, createdAt: now - 2 * 86_400_000 },
        // Moved there by the owner (low score), and an old one: neither counts.
        { id: newId(), formId: form.id, data: {}, meta, status: "spam", spamScore: 0.1, createdAt: now },
        { id: newId(), formId: form.id, data: {}, meta, status: "spam", spamScore: 0.95, createdAt: now - 9 * 86_400_000 },
      ]);
    const res = await api<{ data: FormDto }>(`/forms/${form.id}`, { headers: session.headers });
    expect(res.body.data.counts).toMatchObject({ spam: 4, spamThisWeek: 2 });
  });
});

describe("admin growth", () => {
  it("counts live forms from public sites, ignoring the owner's own tests and dev servers", async () => {
    const headers = await adminHeaders();
    const owner = await createUser({ email: `owner-${crypto.randomUUID()}@growth.test` });
    const live = await createForm({ userId: owner.id, name: "Live" });
    const testing = await createForm({ userId: owner.id, name: "Still testing" });
    const site = `shop-${crypto.randomUUID().slice(0, 8)}.example`;
    const now = Date.now();
    const sub = (formId: string, referrer: string | null, email: string, status: "ok" | "spam" = "ok") => ({
      id: newId(),
      formId,
      data: { email },
      meta: { ...meta, referrer },
      status,
      createdAt: now - 3_600_000,
    });
    await db()
      .insert(submissions)
      .values([
        sub(live.id, `https://${site}/contact`, "customer@example.com"),
        sub(live.id, `https://www.${site}/contact`, "another@example.com"),
        // The owner testing their own form, a local dev server, and spam: none of these make a form live.
        sub(testing.id, `https://${site}/contact`, owner.email),
        sub(testing.id, "http://localhost:5173/", "someone@example.com"),
        sub(testing.id, `https://${site}/contact`, "bot@example.com", "spam"),
      ]);
    await db().insert(userSettings).values({ userId: owner.id, heardFrom: "github", heardFromAt: now });

    const res = await api<{ data: AdminGrowthDto }>("/admin/growth", { headers });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.users).toBeGreaterThanOrEqual(2);
    expect(data.usersLast7d).toBeGreaterThanOrEqual(1);
    expect(data.formsLast7d).toBeGreaterThanOrEqual(2);
    expect(data.liveForms7d).toBeGreaterThanOrEqual(1);
    expect(data.sources).toEqual(expect.arrayContaining([expect.objectContaining({ source: "github" })]));
    expect(data.topSites).toEqual(expect.arrayContaining([{ host: site, forms: 1, submissions: 1 }, { host: `www.${site}`, forms: 1, submissions: 1 }]));
  });

  it("is hidden from non-admins", async () => {
    expect((await api("/admin/growth", { headers: (await signIn()).headers })).status).toBe(404);
  });
});

describe("admin hosts", () => {
  type Hosts = AdminHostsDto;
  const get = async (headers: Record<string, string>) => {
    const res = await api<{ data: Hosts }>("/admin/hosts", { headers });
    expect(res.status).toBe(200);
    return res.body.data;
  };
  const row = (data: Hosts, group: string) => data.groups.find((g) => g.group === group)!;

  it("groups non-spam submissions and forms by where the form is hosted", async () => {
    const headers = await adminHeaders();
    const before = await get(headers);
    expect(before.groups.map((g) => g.group)).toEqual([
      "Lovable",
      "Bolt",
      "v0/Vercel",
      "Netlify",
      "Cloudflare Pages",
      "GitHub Pages",
      "Replit",
      "Framer",
      "Webflow",
      "Custom domain",
      "Local dev",
      "Unknown",
    ]);

    const lovable = await createForm({ name: "Lovable site" });
    const bolt = await createForm({ name: "Bolt site" });
    const mixed = await createForm({ name: "Moved hosts" });
    const now = Date.now();
    const recent = now - 3_600_000;
    const old = now - 90 * 86_400_000;
    const sub = (formId: string, referrer: string | null, createdAt = recent, status: "ok" | "spam" | "held" | "pending_challenge" = "ok") => ({
      id: newId(),
      formId,
      data: { email: "someone@example.com" },
      meta: { ...meta, referrer },
      status,
      createdAt,
    });
    const rows = [
      sub(lovable.id, "https://my-app.lovable.app/contact?x=1"),
      sub(lovable.id, "https://Preview-123.LovableProject.com/"),
      sub(lovable.id, "https://my-app.lovable.app/", old),
      sub(lovable.id, "https://my-app.lovable.app/", recent, "spam"),
      sub(lovable.id, "https://my-app.lovable.app/", recent, "pending_challenge"),
      sub(bolt.id, "https://thing.bolt.host#top", recent, "held"),
      sub(bolt.id, "https://abc.webcontainer.io:3000/"),
      sub(mixed.id, "https://site.vercel.app/"),
      sub(mixed.id, "https://v0.dev/chat"),
      sub(mixed.id, "https://foo.netlify.app"),
      sub(mixed.id, "https://foo.pages.dev/"),
      sub(mixed.id, "https://me.github.io/site/"),
      sub(mixed.id, "https://x.replit.app/"),
      sub(mixed.id, "https://x.framer.website/"),
      sub(mixed.id, "https://x.webflow.io/"),
      sub(mixed.id, "http://localhost:5173/"),
      sub(mixed.id, "http://127.0.0.1:8080/form"),
      sub(mixed.id, "http://[::1]:3000/"),
      sub(mixed.id, "https://www.example.com/contact"),
      // Lookalikes stay custom domains: the suffix has to match on a dot boundary.
      sub(mixed.id, "https://notlovable.app/"),
      sub(mixed.id, null),
      sub(mixed.id, "not a url"),
    ];
    // D1 caps bound variables per statement, so insert a few rows at a time.
    for (let i = 0; i < rows.length; i += 5) await db().insert(submissions).values(rows.slice(i, i + 5));

    const after = await get(headers);
    const delta = (group: string) => {
      const a = row(after, group);
      const b = row(before, group);
      return { submissions30d: a.submissions30d - b.submissions30d, forms30d: a.forms30d - b.forms30d, submissions: a.submissions - b.submissions, forms: a.forms - b.forms };
    };
    expect(delta("Lovable")).toEqual({ submissions30d: 2, forms30d: 1, submissions: 3, forms: 1 });
    expect(delta("Bolt")).toEqual({ submissions30d: 2, forms30d: 1, submissions: 2, forms: 1 });
    expect(delta("v0/Vercel")).toEqual({ submissions30d: 2, forms30d: 1, submissions: 2, forms: 1 });
    for (const group of ["Netlify", "Cloudflare Pages", "GitHub Pages", "Replit", "Framer", "Webflow"]) {
      expect(delta(group), group).toEqual({ submissions30d: 1, forms30d: 1, submissions: 1, forms: 1 });
    }
    expect(delta("Local dev")).toEqual({ submissions30d: 3, forms30d: 1, submissions: 3, forms: 1 });
    expect(delta("Custom domain")).toEqual({ submissions30d: 2, forms30d: 1, submissions: 2, forms: 1 });
    expect(delta("Unknown")).toEqual({ submissions30d: 2, forms30d: 1, submissions: 2, forms: 1 });
    // Three new forms overall, though "mixed" shows up in nine groups.
    expect(after.total.forms - before.total.forms).toBe(3);
    expect(after.total.submissions - before.total.submissions).toBe(22 - 2);
    expect(after.total.submissions30d - before.total.submissions30d).toBe(22 - 3);
  });

  it("is hidden from non-admins and signed-out visitors", async () => {
    expect((await api("/admin/hosts", { headers: (await signIn()).headers })).status).toBe(404);
    expect([401, 404]).toContain((await api("/admin/hosts")).status);
  });
});

describe("health", () => {
  it("is up when the database answers, and 503 when it doesn't", async () => {
    expect(await (await SELF.fetch("https://sendm8.test/health")).json()).toEqual({ ok: true });

    const DB = new Proxy(env.DB, {
      get: (target, prop) =>
        prop === "prepare"
          ? () => {
              throw new Error("D1 down");
            }
          : Reflect.get(target, prop),
    });
    mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await worker.fetch(new Request("https://sendm8.test/health"), { ...env, DB } as Env, { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, error: "database_unavailable" });
  });
});
