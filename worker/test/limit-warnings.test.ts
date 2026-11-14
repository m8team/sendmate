import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLimits } from "../src/config";
import { submissions, usageDaily } from "../src/db/schema";
import { newId } from "../src/lib/ids";
import { monthStartKey } from "../src/lib/time";
import { sendLimitWarnings } from "../src/pipeline/limit-warnings";
import { createForm, createUser, db, mockFetch, waitFor } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const cap = getLimits(env).submissionsPerUnclaimedFormPerMonth;
const month = monthStartKey(Date.now());

const owner = () => `raffle-${crypto.randomUUID().slice(0, 8)}@limit-warn.dev`;

async function noAccountForm(used: number, overrides: Parameters<typeof createForm>[0] = {}) {
  const ownerEmail = owner();
  const form = await createForm({ userId: null, ownerEmail, status: "active", ...overrides });
  await db().insert(usageDaily).values({ scope: "form", scopeId: form.id, day: month, submissions: used });
  // The site its visitors came from, for the email's subject.
  await db()
    .insert(submissions)
    .values({ id: newId(), formId: form.id, data: { name: "Ana" }, meta: { ipHash: null, country: null, userAgent: null, referrer: "https://sorteo.ferragro.dev/", special: {}, spamReasons: [] }, status: "ok", createdAt: Date.now() });
  return { form, ownerEmail };
}

describe("warning no-account forms before they hit the monthly cap", () => {
  it("emails at 80%, and again at the cap, never twice for the same level, and alerts the operator", async () => {
    const http = mockFetch();
    const { form, ownerEmail } = await noAccountForm(Math.ceil(cap * 0.8));

    expect(await sendLimitWarnings(env)).toBeGreaterThanOrEqual(1);
    const first = http.emails().filter((e) => e.to[0] === ownerEmail);
    expect(first).toHaveLength(1);
    expect(first[0]!.subject).toBe(`Your form on sorteo.ferragro.dev has used ${Math.ceil(cap * 0.8)} of ${cap} free submissions`);
    expect(first[0]!.text).toContain(`lift the limit to ${getLimits(env).submissionsPerFormPerMonth.toLocaleString("en-GB")} a month`);
    expect(first[0]!.text).toContain(`only ${getLimits(env).instantEmailsPerUserPerDay} instant emails`);
    expect(first[0]!.text).toContain("/app/sign-in");
    await waitFor(async () => (http.to("alerts.example.com").length > 0 ? true : undefined));

    // Same level again: nothing more.
    await sendLimitWarnings(env);
    expect(http.emails().filter((e) => e.to[0] === ownerEmail)).toHaveLength(1);

    // At the cap: one more, worded as reached.
    await db().update(usageDaily).set({ submissions: cap }).where(eqForm(form.id));
    await sendLimitWarnings(env);
    const all = http.emails().filter((e) => e.to[0] === ownerEmail);
    expect(all).toHaveLength(2);
    expect(all[1]!.subject).toBe("Your form on sorteo.ferragro.dev has hit its monthly limit");
    expect(all[1]!.text).toContain("turned away");

    await sendLimitWarnings(env);
    expect(http.emails().filter((e) => e.to[0] === ownerEmail)).toHaveLength(2);
  });

  it("warns again the next month", async () => {
    const http = mockFetch();
    const { ownerEmail, form } = await noAccountForm(cap);
    await sendLimitWarnings(env);
    expect(http.emails().filter((e) => e.to[0] === ownerEmail)).toHaveLength(1);

    const nextMonth = new Date();
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 5);
    await db().insert(usageDaily).values({ scope: "form", scopeId: form.id, day: monthStartKey(nextMonth.getTime()), submissions: cap });
    await sendLimitWarnings(env, nextMonth.getTime());
    expect(http.emails().filter((e) => e.to[0] === ownerEmail)).toHaveLength(2);
  });

  it("stays quiet for forms under 80%, claimed forms, unconfirmed forms and other months", async () => {
    const http = mockFetch();
    const under = await noAccountForm(Math.ceil(cap * 0.8) - 1);
    const account = await createUser();
    const claimed = await noAccountForm(cap, { userId: account.id });
    const pending = await noAccountForm(cap, { status: "pending_confirmation" });
    const oldMonth = await noAccountForm(0);
    await db().insert(usageDaily).values({ scope: "form", scopeId: oldMonth.form.id, day: "2020-01-01", submissions: cap });

    await sendLimitWarnings(env);
    for (const { ownerEmail } of [under, claimed, pending, oldMonth]) {
      expect(http.emails().filter((e) => e.to[0] === ownerEmail)).toHaveLength(0);
    }
  });
});

const eqForm = (formId: string) => and(eq(usageDaily.scope, "form"), eq(usageDaily.scopeId, formId), eq(usageDaily.day, month));
