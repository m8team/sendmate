import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLimits } from "../src/config";
import { eq } from "drizzle-orm";
import { forms, usageDaily } from "../src/db/schema";
import { dayKey } from "../src/lib/time";
import { AI_SPAM_MODEL, aiSpamScore, parseScore, submissionText } from "../src/pipeline/ai-spam";
import { dispatchStored } from "../src/pipeline/zero-signup";
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
