import { env } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, retryDueDeliveries } from "../src/cron";
import { getDb } from "../src/db/client";
import { submissions, usageDaily } from "../src/db/schema";
import { newId, ulidFloor } from "../src/lib/ids";
import { withQueryBudget } from "../src/lib/query-budget";
import { checkUsage, databaseSize, LOAD_SHED_SCOPE } from "../src/lib/usage";
import { deliverMany } from "../src/pipeline/deliver-many";
import { sendDueDigests } from "../src/pipeline/digest";
import { addAddress, addChannel, addEmailChannel, createForm, createUser, db, getSubmission, mockFetch, SLACK_URL } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const meta = { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] };

async function seedSubmissions(formId: string, count: number, extra: Partial<typeof submissions.$inferInsert> = {}) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = newId();
    ids.push(id);
    await db().insert(submissions).values({ id, formId, data: { n: String(i) }, meta, status: "ok", createdAt: Date.now(), ...extra });
  }
  return ids;
}

describe("query budget", () => {
  it("counts every statement, including each one inside a batch", async () => {
    const budget = withQueryBudget(env, 50);
    const d = getDb(budget.env);
    await d.select().from(usageDaily).limit(1).all();
    await budget.env.DB.prepare("SELECT 1").first();
    await budget.env.DB.prepare("SELECT ?").bind(2).raw();
    await d.batch([d.select().from(usageDaily).limit(1), d.select().from(usageDaily).limit(1), d.select().from(usageDaily).limit(1)]);
    expect(budget.used()).toBe(6);
    // 50 minus a 5-query safety margin minus 6 used.
    expect(budget.left()).toBe(39);
    expect(budget.has(39)).toBe(true);
    expect(budget.has(40)).toBe(false);
  });

  it("starts from queries the request already spent", () => {
    const budget = withQueryBudget(env, 50, 45);
    expect(budget.left()).toBe(0);
    expect(budget.has(1)).toBe(false);
  });
});

describe("jobs stay inside the per-invocation query cap", () => {
  it("retries only as many deliveries as fit, leaving the rest due", async () => {
    mockFetch();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id });
    await addChannel(form.id, "slack", { webhookUrl: SLACK_URL });
    const ids = await seedSubmissions(form.id, 6, { retryAt: 1 });

    // A small cap: each delivery only starts if a worst-case 12 queries still fit.
    const budget = withQueryBudget(env, 31);
    const delivered = await retryDueDeliveries(env, Date.now(), budget);
    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThan(6);
    expect(budget.used()).toBeLessThanOrEqual(31);

    const rows = await db().select().from(submissions).where(inArray(submissions.id, ids)).all();
    expect(rows.filter((r) => r.retryAt === null)).toHaveLength(delivered);
    expect(rows.filter((r) => r.retryAt !== null)).toHaveLength(6 - delivered);
  });

  it("queues what doesn't fit when delivering many at once", async () => {
    const http = mockFetch();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id });
    await addChannel(form.id, "slack", { webhookUrl: SLACK_URL });
    const ids = await seedSubmissions(form.id, 8);

    const delivered = await deliverMany({ ...env, LIMITS_JSON: '{"queriesPerInvocation": 40}' } as Env, ids, { now: 1000 });
    expect(delivered).toBeGreaterThan(0);
    expect(delivered).toBeLessThan(8);
    expect(http.to("hooks.slack.com")).toHaveLength(delivered);

    const queued = (await db().select().from(submissions).where(inArray(submissions.id, ids)).all()).filter((r) => r.retryAt === 1000);
    expect(queued).toHaveLength(8 - delivered);

    // The retry cron finishes the job.
    await retryDueDeliveries(env, 2000);
    const done = await db().select().from(submissions).where(inArray(submissions.id, ids)).all();
    expect(done.every((r) => r.deliveries[0]?.status === "sent" && r.retryAt === null)).toBe(true);
  });

  it("sends only the digests that fit, and every digest sent is marked sent", async () => {
    const http = mockFetch();
    const addressIds: string[] = [];
    const digestIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const owner = await createUser();
      const form = await createForm({ userId: owner.id });
      const address = await addAddress(owner.id, `${owner.id}@digest-budget.test`);
      addressIds.push(address.email);
      const channel = await addEmailChannel(form.id, address.id);
      digestIds.push(
        ...(await seedSubmissions(form.id, 2, { digestAt: 5, deliveries: [{ channelId: channel.id, status: "digest", attempts: 1, at: 1 }] })),
      );
    }

    const budget = withQueryBudget(env, 30);
    await sendDueDigests(env, 10, budget);
    expect(budget.used()).toBeLessThanOrEqual(30);

    const sentTo = http.emails().map((e) => e.to[0]).filter((to: string) => addressIds.includes(to));
    expect(sentTo.length).toBeGreaterThan(0);
    const rows = await db().select().from(submissions).where(inArray(submissions.id, digestIds)).all();
    const markedSent = rows.filter((r) => r.deliveries[0]?.status === "sent");
    // Two submissions per recipient: every email that went out has both rows written back.
    expect(markedSent).toHaveLength(sentTo.length * 2);
    expect(rows.filter((r) => r.digestAt !== null)).toHaveLength(12 - sentTo.length * 2);
  });
});

describe("database size", () => {
  it("reads the D1 size from query metadata", async () => {
    const size = await databaseSize(env);
    expect(size === null || size > 0).toBe(true);
    const failing = { DB: { prepare: () => ({ run: async () => Promise.reject(new Error("boom")) }) } } as unknown as Env;
    expect(await databaseSize(failing)).toBeNull();
  });

  it("alerts and sheds load as the database nears its cap", async () => {
    const size = await databaseSize(env);
    if (size === null) return; // Local runtime didn't report a size; covered by the unit above.
    const http = mockFetch();
    const day = new Date(Date.now()).toISOString().slice(0, 10);
    await db().delete(usageDaily).where(eq(usageDaily.scope, LOAD_SHED_SCOPE));
    await db().delete(usageDaily).where(eq(usageDaily.scope, "alert"));

    const nearlyFull = { ...env, LIMITS_JSON: JSON.stringify({ databaseMaxBytes: Math.ceil(size / 0.95) }) } as Env;
    const result = await checkUsage(nearlyFull);
    expect(result.shed).toBe(true);
    expect(result.alerts.some((a) => a.startsWith("Database size at"))).toBe(true);
    expect(http.to("alerts.example.com").at(-1)!.body.embeds[0].description).toContain("Database filling up");
    expect(await db().select().from(usageDaily).where(eq(usageDaily.scope, LOAD_SHED_SCOPE)).get()).toMatchObject({ day });

    await db().delete(usageDaily).where(eq(usageDaily.scope, LOAD_SHED_SCOPE));
  });
});

describe("retention", () => {
  it("keeps everything by default, and purges old submissions when a retention period is set", async () => {
    const form = await createForm();
    const oldId = `${ulidFloor(Date.now() - 400 * 86_400_000).slice(0, 10)}${"a".repeat(16)}`;
    const recentId = newId();
    await db().insert(submissions).values([
      { id: oldId, formId: form.id, data: {}, meta, status: "ok", createdAt: Date.now() - 400 * 86_400_000 },
      { id: recentId, formId: form.id, data: {}, meta, status: "ok", createdAt: Date.now() },
    ]);

    await cleanup(env, Date.now());
    expect(await getSubmission(oldId)).toBeDefined();

    await cleanup({ ...env, LIMITS_JSON: '{"submissionRetentionDays": 365}' } as Env, Date.now());
    expect(await getSubmission(oldId)).toBeUndefined();
    expect(await getSubmission(recentId)).toBeDefined();
  });

  it("builds time-ordered id floors", () => {
    const earlier = ulidFloor(1_000_000);
    const later = ulidFloor(2_000_000);
    expect(earlier < later).toBe(true);
    expect(earlier).toMatch(/^[0-9a-z]{10}0{16}$/);
    expect(newId() > ulidFloor(Date.now() - 60_000)).toBe(true);
  });
});
