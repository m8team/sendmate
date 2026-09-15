import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hmacHex } from "../src/lib/crypto";
import { deliverSubmission } from "../src/pipeline/deliver";
import { retryDueDeliveries } from "../src/cron";
import { addChannel, createForm, createUser, DISCORD_URL, getSubmission, mockFetch, postJson, SLACK_URL, TELEGRAM_TOKEN, waitFor } from "./helpers";

async function formWith(type: "discord" | "slack" | "telegram" | "webhook", config: unknown, settings = {}) {
  const owner = await createUser();
  const form = await createForm({ userId: owner.id, name: "Leads", settings });
  const channel = await addChannel(form.id, type, config);
  return { form, channel };
}

async function submitAndSettle(formId: string, body: Record<string, string> = { name: "Ada", message: "Hi there" }) {
  const res = await postJson(formId, body);
  const { id } = await res.json<{ id: string }>();
  return waitFor(async () => {
    const row = await getSubmission(id);
    return row && row.deliveries.length > 0 ? row : undefined;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat channels", () => {
  it("posts to Discord", async () => {
    const http = mockFetch();
    const { form } = await formWith("discord", { webhookUrl: DISCORD_URL });
    const row = await submitAndSettle(form.id);

    expect(row.deliveries[0]).toMatchObject({ status: "sent", attempts: 1 });
    const [req] = http.to("discord.com");
    expect(req!.url).toBe(DISCORD_URL);
    expect(req!.body.embeds[0].fields).toContainEqual({ name: "name", value: "Ada", inline: false });
    expect(req!.headers.get("user-agent")).toContain("sendm8");
  });

  it("posts to Slack", async () => {
    const http = mockFetch();
    const { form } = await formWith("slack", { webhookUrl: SLACK_URL });
    const row = await submitAndSettle(form.id);
    expect(row.deliveries[0]?.status).toBe("sent");
    expect(http.to("hooks.slack.com")[0]!.body.blocks[0].text.text).toBe("New submission: Leads");
  });

  it("sends Telegram messages as HTML", async () => {
    const http = mockFetch();
    const { form } = await formWith("telegram", { botToken: TELEGRAM_TOKEN, chatId: "-100123" });
    const row = await submitAndSettle(form.id);
    expect(row.deliveries[0]?.status).toBe("sent");
    const [req] = http.to("api.telegram.org");
    expect(req!.url).toBe(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`);
    expect(req!.body).toMatchObject({ chat_id: "-100123", parse_mode: "HTML" });
  });

  it("keeps Telegram errors free of the bot token", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError(`fetch failed for https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`));
    const { form } = await formWith("telegram", { botToken: TELEGRAM_TOKEN, chatId: "-100123" });
    const row = await submitAndSettle(form.id);
    expect(row.deliveries[0]).toMatchObject({ status: "failed", error: "network error" });
    expect(JSON.stringify(row.deliveries)).not.toContain(TELEGRAM_TOKEN);
  });

  it("treats a Telegram 'chat not found' as permanent", async () => {
    mockFetch(() => Response.json({ ok: false, description: "Bad Request: chat not found" }, { status: 400 }));
    const { form } = await formWith("telegram", { botToken: TELEGRAM_TOKEN, chatId: "-1" });
    const row = await submitAndSettle(form.id);
    expect(row.deliveries[0]).toMatchObject({ status: "skipped", error: "400 Bad Request: chat not found" });
  });

  it("sends chat notifications instantly even when email is in digest mode", async () => {
    const http = mockFetch();
    const { form } = await formWith("discord", { webhookUrl: DISCORD_URL }, { notifyMode: "digest" });
    const row = await submitAndSettle(form.id);
    expect(row.deliveries[0]?.status).toBe("sent");
    expect(row.digestAt).toBeNull();
    expect(http.to("discord.com")).toHaveLength(1);
  });

  it("sends nothing when notifications are off", async () => {
    const http = mockFetch();
    const { form } = await formWith("discord", { webhookUrl: DISCORD_URL }, { notifyMode: "off" });
    const res = await postJson(form.id, { a: "b" });
    const { id } = await res.json<{ id: string }>();
    await deliverSubmission(env, id);
    expect(http.requests).toHaveLength(0);
  });
});

describe("webhooks", () => {
  it("delivers a signed payload the receiver can verify", async () => {
    const http = mockFetch();
    const secret = "whsec_receiver_test";
    const { form } = await formWith("webhook", { url: "https://hooks.example.com/sendm8", secret });
    const row = await submitAndSettle(form.id, { email: "ada@example.com", message: "Hi" });

    expect(row.deliveries[0]?.status).toBe("sent");
    const [req] = http.to("hooks.example.com");
    expect(req!.headers.get("x-sendm8-event")).toBe("submission.created");
    expect(req!.headers.get("x-sendm8-delivery")).toBe(row.id);
    expect(req!.body).toMatchObject({ event: "submission.created", form: { id: form.id, name: "Leads" }, submission: { id: row.id, replyTo: "ada@example.com" } });

    // Verify exactly as a receiver would.
    const [, t, v1] = req!.headers.get("x-sendm8-signature")!.match(/^t=(\d+),v1=([0-9a-f]{64})$/)!;
    expect(v1).toBe(await hmacHex(secret, `${t}.${req!.rawBody}`));
    expect(Math.abs(Number(t) - Date.now() / 1000)).toBeLessThan(60);
  });

  it("retries 5xx and timeouts, then succeeds", async () => {
    let calls = 0;
    mockFetch(() => (++calls === 1 ? new Response("upstream down", { status: 503 }) : undefined));
    const { form } = await formWith("webhook", { url: "https://hooks.example.com/flaky", secret: "whsec_x" });

    const row = await submitAndSettle(form.id);
    expect(row.deliveries[0]).toMatchObject({ status: "failed", attempts: 1, error: "503 upstream down" });

    await retryDueDeliveries(env, row.retryAt! + 1);
    expect((await getSubmission(row.id))?.deliveries[0]).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("reports timeouts as retryable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new DOMException("The operation timed out", "TimeoutError"));
    const { form } = await formWith("webhook", { url: "https://hooks.example.com/slow", secret: "whsec_x" });
    const row = await submitAndSettle(form.id);
    expect(row.deliveries[0]).toMatchObject({ status: "failed", error: "timeout after 5000ms" });
  });

  it("does not follow redirects", async () => {
    mockFetch(() => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    const { form } = await formWith("webhook", { url: "https://hooks.example.com/redirect", secret: "whsec_x" });
    const row = await submitAndSettle(form.id);
    expect(row.deliveries[0]).toMatchObject({ status: "skipped", error: "302 redirects aren't followed" });
  });

  it("refuses to send to a URL the guard now blocks", async () => {
    const http = mockFetch();
    const { form } = await formWith("webhook", { url: "https://10.0.0.5/hook", secret: "whsec_x" });
    const row = await submitAndSettle(form.id);
    expect(row.deliveries[0]).toMatchObject({ status: "skipped" });
    expect(row.deliveries[0]?.error).toContain("private network");
    expect(http.requests).toHaveLength(0);
  });

  it("gives up after the maximum number of attempts", async () => {
    mockFetch(() => new Response("nope", { status: 500 }));
    const { form } = await formWith("webhook", { url: "https://hooks.example.com/dead", secret: "whsec_x" });
    let row = await submitAndSettle(form.id);
    for (let i = 0; i < 4; i++) {
      await retryDueDeliveries(env, row.retryAt! + 1);
      row = (await getSubmission(row.id))!;
    }
    expect(row.deliveries[0]).toMatchObject({ status: "skipped", attempts: 5 });
    expect(row.retryAt).toBeNull();
  });
});

describe("multiple channels", () => {
  it("only retries the channels that failed", async () => {
    let slackDown = true;
    const http = mockFetch((req) => (req.url.startsWith("https://hooks.slack.com") && slackDown ? new Response("x", { status: 500 }) : undefined));
    const owner = await createUser();
    const form = await createForm({ userId: owner.id });
    await addChannel(form.id, "discord", { webhookUrl: DISCORD_URL });
    await addChannel(form.id, "slack", { webhookUrl: SLACK_URL });

    const row = await submitAndSettle(form.id);
    expect(row.deliveries.map((d) => d.status).sort()).toEqual(["failed", "sent"]);

    slackDown = false;
    await retryDueDeliveries(env, row.retryAt! + 1);
    const after = await getSubmission(row.id);
    expect(after?.deliveries.every((d) => d.status === "sent")).toBe(true);
    expect(http.to("discord.com")).toHaveLength(1);
    expect(http.to("hooks.slack.com")).toHaveLength(2);
  });
});
