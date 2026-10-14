import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLimits } from "../src/config";
import { eq } from "drizzle-orm";
import { forms, submissions, usageDaily } from "../src/db/schema";
import { newId } from "../src/lib/ids";
import { dayKey } from "../src/lib/time";
import { AI_SPAM_MODEL, aiSpamScore, ownerIsTesting, parseScore, submissionText } from "../src/pipeline/ai-spam";
import { deliverBacklog, dispatchStored } from "../src/pipeline/zero-signup";
import { addChannel, createForm, createUser, db, DISCORD_URL, getSubmission, listSubmissions, mockFetch, postJson } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
});

const withAi = (reply: unknown) => {
  const run = vi.fn(async () => reply);
  return { env: { ...env, AI: { run } as unknown as Ai } as Env, run };
};

describe("parsing model output", () => {
  it.each([
    [{ response: "92" }, 92],
    // Workers AI returns the number itself for some models, and OpenAI-style choices for others.
    [{ response: 83 }, 83],
    [{ choices: [{ message: { content: "7" } }] }, 7],
    [{ choices: [{ message: { content: 0 } }] }, 0],
    [{ response: 101 }, null],
    [{ response: 12.5 }, null],
    [{ response: "Spam probability: 7" }, 7],
    ["100", 100],
    [{ response: "definitely spam" }, null],
    [{ response: "250" }, null],
    [{}, null],
    [null, null],
  ])("%o → %s", (output, expected) => {
    expect(parseScore(output)).toBe(expected);
  });

  it("flattens and truncates submission data", () => {
    expect(submissionText({ name: "Ada", tags: ["a", "b"] })).toBe("name: Ada\ntags: a, b");
    expect(submissionText({ essay: "x".repeat(5000) }).length).toBe(2000);
  });
});

describe("AI spam scoring", () => {
  it("scores with a capped daily budget and never throws", async () => {
    const { env: aiEnv, run } = withAi({ response: "12" });
    expect(await aiSpamScore(aiEnv, { data: { message: "Hi, can I book a table?" } })).toBe(12);
    expect(run).toHaveBeenCalledWith(AI_SPAM_MODEL, expect.objectContaining({ max_tokens: 4, temperature: 0 }));

    // No AI binding (wrangler.jsonc binds one, so remove it for this case).
    expect(await aiSpamScore({ ...env, AI: undefined } as Env, { data: {} })).toBeNull();

    const failing = { ...env, AI: { run: vi.fn(async () => Promise.reject(new Error("model down"))) } } as unknown as Env;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await aiSpamScore(failing, { data: { a: "b" } })).toBeNull();

    const tomorrow = Date.now() + 86_400_000 * 3;
    await db().insert(usageDaily).values({ scope: "ai_spam_check", scopeId: "all", day: dayKey(tomorrow), emails: getLimits(env).aiSpamChecksPerDay });
    expect(await aiSpamScore(aiEnv, { data: { a: "b" } }, tomorrow)).toBeNull();
  });

  it("moves confident spam to the spam folder before any delivery", async () => {
    const http = mockFetch();
    const owner = await createUser();
    // Notifications off while storing, so only the explicit dispatch below (with a fake AI) runs.
    const form = await createForm({ userId: owner.id, settings: { notifyMode: "off" } });
    await addChannel(form.id, "discord", { webhookUrl: DISCORD_URL });
    const res = await postJson(form.id, { message: "Guaranteed page one rankings, reply now" });
    const { id } = await res.json<{ id: string }>();

    const { env: aiEnv } = withAi({ response: "97" });
    await dispatchStored(aiEnv, { ...form, status: "active", settings: { aiSpamScoring: true } }, id, null);

    const row = await getSubmission(id);
    expect(row?.status).toBe("spam");
    expect(row?.spamScore).toBe(0.97);
    expect(row?.meta.spamReasons).toContain("ai:97");
    expect(http.to("discord.com")).toHaveLength(0);
  });

  it("delivers a borderline score instead of binning it", async () => {
    mockFetch();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id, settings: { notifyMode: "off" } });
    // The real message this guards: "i need to collaborate with you for a projet" scored 80 and was binned.
    const res = await postJson(form.id, { message: "hello, i need to collaborate with you for a projet. i think you're qualified for this job" });
    const { id } = await res.json<{ id: string }>();

    const { env: aiEnv } = withAi({ response: "80" });
    await dispatchStored(aiEnv, { ...form, status: "active", settings: { aiSpamScoring: true } }, id, null);

    const row = await getSubmission(id);
    expect(row).toMatchObject({ status: "ok", spamScore: 0.8 });
    expect(row?.meta.spamReasons).toContain("ai:80");
  });

  it("checks what arrived while an email endpoint waited for confirmation, before delivering it", async () => {
    const http = mockFetch();
    const form = await createForm({ userId: null, ownerEmail: `backlog-${crypto.randomUUID().slice(0, 8)}@example.com`, status: "active", settings: { aiSpamScoring: true } });
    await addChannel(form.id, "discord", { webhookUrl: DISCORD_URL });
    const meta = { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] };
    const realId = newId();
    const spamId = newId();
    await db().insert(submissions).values([
      { id: realId, formId: form.id, data: { message: "Can you quote for a site?" }, meta, status: "ok", createdAt: Date.now() },
      { id: spamId, formId: form.id, data: { message: "casino bonus, click now" }, meta, status: "ok", createdAt: Date.now() },
    ]);

    const run = vi.fn(async (_model: string, input: { messages: { content: string }[] }) => ({ response: input.messages[1]!.content.includes("casino") ? 97 : 4 }));
    await deliverBacklog({ ...env, AI: { run } as unknown as Ai } as Env, [form.id]);

    expect(run).toHaveBeenCalledTimes(2);
    expect(await getSubmission(spamId)).toMatchObject({ status: "spam", spamScore: 0.97 });
    expect(await getSubmission(realId)).toMatchObject({ status: "ok", spamScore: 0.04 });
    expect(http.to("discord.com")).toHaveLength(1);
  });

  it("lets the owner's own clean test messages through without asking the model", async () => {
    const http = mockFetch();
    const owner = `tester-${crypto.randomUUID().slice(0, 8)}+folio@example.com`;
    const form = await createForm({ userId: null, ownerEmail: owner, status: "active", settings: { aiSpamScoring: true } });
    await addChannel(form.id, "discord", { webhookUrl: DISCORD_URL });
    const meta = { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] };
    const testId = newId();
    const linkId = newId();
    const strangerId = newId();
    await db().insert(submissions).values([
      // Signed with the base address of the owner's +tag: still them.
      { id: testId, formId: form.id, data: { email: owner.replace("+folio", ""), message: "Message technique pour ouvrir la reception." }, meta, status: "ok", createdAt: Date.now() },
      // The endpoint address is public, so a red flag still goes to the model.
      { id: linkId, formId: form.id, data: { email: owner, message: "seo deal" }, meta: { ...meta, spamReasons: ["links"] }, spamScore: 0.4, status: "ok", createdAt: Date.now() },
      { id: strangerId, formId: form.id, data: { email: "someone@example.org", message: "Message technique." }, meta, status: "ok", createdAt: Date.now() },
    ]);

    const run = vi.fn(async () => ({ response: 95 }));
    await deliverBacklog({ ...env, AI: { run } as unknown as Ai } as Env, [form.id]);

    expect(run).toHaveBeenCalledTimes(2);
    expect(await getSubmission(testId)).toMatchObject({ status: "ok", spamScore: 0 });
    expect(await getSubmission(linkId)).toMatchObject({ status: "spam" });
    expect(await getSubmission(strangerId)).toMatchObject({ status: "spam" });
    expect(http.to("discord.com")).toHaveLength(1);
  });

  it("only treats the owner's own address, or a +tag of the same inbox, as the owner", () => {
    const meta = { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] };
    const from = (email: string, special: Record<string, string> = {}) => ({ data: { email }, meta: { ...meta, special } });
    expect(ownerIsTesting(from("Kim@Example.com"), "kim@example.com")).toBe(true);
    expect(ownerIsTesting(from("kim+test@example.com"), "kim@example.com")).toBe(true);
    expect(ownerIsTesting(from("x@y.z", { _replyto: "kim@example.com" }), "kim@example.com")).toBe(true);
    expect(ownerIsTesting(from("kimberly@example.com"), "kim@example.com")).toBe(false);
    expect(ownerIsTesting(from("kim@example.org"), "kim@example.com")).toBe(false);
    expect(ownerIsTesting(from("kim@example.com"), null)).toBe(false);
  });

  it("delivers the backlog unchecked when the form doesn't use AI scoring", async () => {
    const http = mockFetch();
    const form = await createForm({ userId: null, ownerEmail: `plain-${crypto.randomUUID().slice(0, 8)}@example.com`, status: "active", settings: {} });
    await addChannel(form.id, "discord", { webhookUrl: DISCORD_URL });
    const meta = { ipHash: null, country: null, userAgent: null, referrer: null, special: {}, spamReasons: [] };
    await db().insert(submissions).values({ id: newId(), formId: form.id, data: { message: "hello" }, meta, status: "ok", createdAt: Date.now() });

    const run = vi.fn();
    await deliverBacklog({ ...env, AI: { run } as unknown as Ai } as Env, [form.id]);
    expect(run).not.toHaveBeenCalled();
    expect(http.to("discord.com")).toHaveLength(1);
  });

  it("records what the model thought, even when it isn't spam", async () => {
    mockFetch();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id, settings: { notifyMode: "off" } });
    const res = await postJson(form.id, { message: "Can you quote for a five page site?" });
    const { id } = await res.json<{ id: string }>();

    const { env: aiEnv } = withAi({ response: "35" });
    await dispatchStored(aiEnv, { ...form, status: "active", settings: { aiSpamScoring: true } }, id, null);

    const row = await getSubmission(id);
    // Scored and kept in the inbox: the dashboard shows "a bit suspicious" rather than a bare zero.
    expect(row).toMatchObject({ status: "ok", spamScore: 0.35 });
    expect(row?.meta.spamReasons).toContain("ai:35");
  });

  it("delivers normally when the model thinks it's fine", async () => {
    const http = mockFetch();
    const owner = await createUser();
    const form = await createForm({ userId: owner.id, settings: { notifyMode: "off" } });
    await addChannel(form.id, "discord", { webhookUrl: DISCORD_URL });
    const res = await postJson(form.id, { message: "Do you ship to Canada?" });
    const { id } = await res.json<{ id: string }>();

    // Turn notifications on for real now that the submission is stored.
    await db().update(forms).set({ settings: { aiSpamScoring: true } }).where(eq(forms.id, form.id));
    const { env: aiEnv, run } = withAi({ response: "3" });
    await dispatchStored(aiEnv, { ...form, status: "active", settings: { aiSpamScoring: true } }, id, null);
    expect(run).toHaveBeenCalledOnce();
    expect((await getSubmission(id))?.deliveries[0]?.status).toBe("sent");
    expect(http.to("discord.com")).toHaveLength(1);
  });

  it("is skipped for forms that haven't turned it on", async () => {
    mockFetch();
    const form = await createForm({ settings: { notifyMode: "off" } });
    await postJson(form.id, { message: "hi" });
    const [row] = await listSubmissions(form.id);
    const { env: aiEnv, run } = withAi({ response: "99" });
    await dispatchStored(aiEnv, { ...form, status: "active", settings: {} }, row!.id, null);
    expect(run).not.toHaveBeenCalled();
    expect((await getSubmission(row!.id))?.status).toBe("ok");
  });
});
