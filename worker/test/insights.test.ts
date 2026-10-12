import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminGrowthDto, FormDto, MeDto } from "@sendm8/shared";
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
