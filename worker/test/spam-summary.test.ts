import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { submissions } from "../src/db/schema";
import { newId } from "../src/lib/ids";
import { withQueryBudget } from "../src/lib/query-budget";
import { sendSpamSummaries } from "../src/pipeline/spam-summary";
import { createForm, createUser, db, mockFetch } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const meta = { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] };
const DAY = 86_400_000;

/** A clock no other test uses, so only this file's submissions are in the summary window. */
let clock = Date.UTC(2093, 0, 5, 9);
const freshWeek = () => (clock += 30 * DAY);

async function spam(formId: string, now: number, scores: number[], ageMs = 3_600_000) {
  await db()
    .insert(submissions)
    .values(scores.map((spamScore) => ({ id: newId(), formId, data: { message: "buy now" }, meta, status: "spam" as const, spamScore, createdAt: now - ageMs })));
}

type Email = { to: string[]; subject: string; html: string; text: string };
const summariesTo = (http: ReturnType<typeof mockFetch>, address: string) => (http.emails() as Email[]).filter((e) => e.to.includes(address) && e.subject.includes("spam"));

describe("weekly spam summary", () => {
  it("tells the owner what was binned, flags close calls, and links to the spam folder", async () => {
    const http = mockFetch();
    const now = freshWeek();
    const owner = await createUser();
    const contact = await createForm({ userId: owner.id, name: "Contact", status: "active" });
    const quotes = await createForm({ userId: owner.id, name: "Quotes", status: "active" });
    await spam(contact.id, now, [0.85, 0.99]);
    await spam(quotes.id, now, [1]);
    // Moved to spam by the owner, and last week's: not mentioned.
    await spam(quotes.id, now, [0.1]);
    await spam(quotes.id, now, [0.99], 8 * DAY);

    expect(await sendSpamSummaries(env, now)).toBeGreaterThanOrEqual(1);
    const [email, ...extra] = summariesTo(http, owner.email);
    expect(extra).toHaveLength(0);
    expect(email!.subject).toBe("3 messages went to your spam folder");
    expect(email!.text).toContain("One was a close call");
    expect(email!.text).toContain("- Contact: 2 in spam (1 close)");
    expect(email!.text).toContain("- Quotes: 1 in spam");
    expect(email!.html).toContain(`/app/forms/${contact.id}?folder=spam`);
    expect(email!.html).toContain("Spam is kept for 30 days");

    // Once a week at most.
    expect(await sendSpamSummaries(env, now + 3_600_000)).toBe(0);
    expect(summariesTo(http, owner.email)).toHaveLength(1);
  });

  it("asks unclaimed email-endpoint owners to sign in instead of linking a dashboard they don't have", async () => {
    const http = mockFetch();
    const now = freshWeek();
    const address = `endpoint-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const form = await createForm({ userId: null, ownerEmail: address, name: `Form for ${address}`, status: "active" });
    await spam(form.id, now, [0.99]);

    await sendSpamSummaries(env, now);
    const [email] = summariesTo(http, address);
    expect(email!.subject).toBe("1 message went to your spam folder");
    expect(email!.text).toContain("It looked clear-cut");
    expect(email!.text).toContain("Sign in to review: https://sendm8.test/app/sign-in");
    expect(email!.html).not.toContain("?folder=spam");
  });

  it("stays quiet for forms with notifications off, and for forms that aren't active", async () => {
    const http = mockFetch();
    const now = freshWeek();
    const quiet = await createUser();
    await spam((await createForm({ userId: quiet.id, status: "active", settings: { notifyMode: "off" } })).id, now, [0.9]);
    const paused = await createUser();
    await spam((await createForm({ userId: paused.id, status: "paused" })).id, now, [0.9]);

    await sendSpamSummaries(env, now);
    expect(summariesTo(http, quiet.email)).toHaveLength(0);
    expect(summariesTo(http, paused.email)).toHaveLength(0);
  });

  it("waits for the next run when the email budget or query budget is spent", async () => {
    mockFetch();
    const now = freshWeek();
    const owner = await createUser();
    await spam((await createForm({ userId: owner.id, status: "active" })).id, now, [0.9]);

    expect(await sendSpamSummaries(env, now, withQueryBudget(env, 50, 48))).toBe(0);
    const noEmails = { ...env, LIMITS_JSON: JSON.stringify({ systemEmailsPerDay: 0 }) } as Env;
    expect(await sendSpamSummaries(noEmails, now)).toBe(0);
    // Nothing was marked as sent, so a later run still delivers it.
    expect(await sendSpamSummaries(env, now)).toBeGreaterThanOrEqual(1);
  });
});
