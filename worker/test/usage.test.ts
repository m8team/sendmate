import type { AdminUsageDto } from "@sendm8/shared";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { forms, usageDaily } from "../src/db/schema";
import { dayKey } from "../src/lib/time";
import { checkUsage, D1_DAILY_WRITES, LOAD_SHED_SCOPE } from "../src/lib/usage";
import { api, createForm, createUser, db, listSubmissions, mockFetch, postJson, signIn } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

// Usage counters are platform-wide, so this file runs as one ordered scenario.
describe("free-tier usage guard", () => {
  it("alerts once per threshold, then sheds load near the D1 write limit", async () => {
    const http = mockFetch();
    const now = Date.now();
    const day = dayKey(now);

    // Quiet day: nothing happens.
    const quiet = await checkUsage(env, now);
    expect(quiet.alerts).toEqual([]);
    expect(quiet.shed).toBe(false);
    expect(http.to("alerts.example.com")).toHaveLength(0);

    // ~75% of the daily write budget (3 writes per submission).
    const form = await createForm();
    await db().insert(usageDaily).values({ scope: "form", scopeId: form.id, day, submissions: Math.ceil((D1_DAILY_WRITES * 0.75) / 3) });
    const warm = await checkUsage(env, now);
    expect(warm.alerts).toHaveLength(1);
    expect(warm.alerts[0]).toContain("D1 writes (estimated) at 75%");
    expect(warm.shed).toBe(false);
    const [alert] = http.to("alerts.example.com");
    expect(alert!.body.embeds[0].title).toContain("Usage alert for");
    expect(alert!.body.embeds[0].description).toContain("D1 writes (estimated) at 75%");

    // Running again the same day doesn't repeat the alert.
    expect((await checkUsage(env, now)).alerts).toEqual([]);
    expect(http.to("alerts.example.com")).toHaveLength(1);

    // Past 90%: another alert, and load shedding switches on.
    await db().update(usageDaily).set({ submissions: Math.ceil((D1_DAILY_WRITES * 0.95) / 3) }).where(eq(usageDaily.scopeId, form.id));
    const hot = await checkUsage(env, now);
    expect(hot.shed).toBe(true);
    expect(hot.alerts[0]).toContain("at 95%");
    expect(http.to("alerts.example.com").at(-1)!.body.embeds[0].description).toContain("Load shedding is on");
    const shedRow = await db().select().from(usageDaily).where(eq(usageDaily.scope, LOAD_SHED_SCOPE)).get();
    expect(shedRow?.day).toBe(day);

    // While shedding: real submissions still land, spam isn't stored, and new email endpoints are refused.
    const target = await createForm();
    expect((await postJson(target.id, { message: "real person" })).status).toBe(200);
    expect((await postJson(target.id, { message: "Best SEO services backlinks casino http://a.co http://b.co http://c.co [url=http://d.co]x[/url]" })).status).toBe(200);
    const stored = await listSubmissions(target.id);
    expect(stored.map((s) => s.status)).toEqual(["ok"]);

    const email = `shed${Date.now()}@zero.test`;
    expect((await postJson(email, { a: "b" })).status).toBe(429);
    expect(await db().select().from(forms).where(eq(forms.ownerEmail, email)).get()).toBeUndefined();

    // Admins see the same numbers, including storage.
    const boss = await createUser({ email: "boss@sendm8.test" });
    const usage = await api<{ data: AdminUsageDto }>("/admin/usage", { headers: (await signIn(boss.id)).headers });
    expect(usage.body.data.estimatedWrites).toBeGreaterThanOrEqual(D1_DAILY_WRITES * 0.95);
    expect(usage.body.data.storageLimitBytes).toBeGreaterThan(0);
  });

  it("doesn't need an alert webhook to shed load", async () => {
    mockFetch();
    const withoutHook = { ...env, ALERT_WEBHOOK_URL: undefined } as Env;
    const result = await checkUsage(withoutHook, Date.now() + 86_400_000 * 2);
    expect(result.shed).toBe(false);
  });
});
