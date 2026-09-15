import type { ChannelDto, CreatedChannelDto } from "@sendm8/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { channels } from "../src/db/schema";
import { hmacHex } from "../src/lib/crypto";
import { api, createForm, db, DISCORD_URL, mockFetch, signIn, SLACK_URL, TELEGRAM_TOKEN } from "./helpers";

type Data<T> = { data: T };
type Err = { error: { code: string; message: string } };

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup() {
  const session = await signIn();
  const form = await createForm({ userId: session.userId, name: "Leads" });
  const create = (body: unknown) => api<Data<CreatedChannelDto> & Err>(`/forms/${form.id}/channels`, { method: "POST", body, headers: session.headers });
  return { session, form, create };
}

describe("creating chat channels", () => {
  it("validates a Discord webhook with Discord and labels it", async () => {
    const http = mockFetch();
    const { create } = await setup();
    const res = await create({ type: "discord", webhookUrl: DISCORD_URL });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ type: "discord", label: "Discord · form-alerts", enabled: true });
    expect(res.body.data.secret).toBeUndefined();
    expect(http.to("discord.com")[0]!.method).toBe("GET");
  });

  it("rejects Discord webhooks that don't exist or aren't Discord", async () => {
    mockFetch(() => new Response(JSON.stringify({ message: "Unknown Webhook" }), { status: 404 }));
    const { create } = await setup();
    expect((await create({ type: "discord", webhookUrl: DISCORD_URL })).body.error.code).toBe("channel_invalid");
    expect((await create({ type: "discord", webhookUrl: "https://evil.example/api/webhooks/1/2" })).status).toBe(422);
  });

  it("reports when Discord can't be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network"));
    const { create } = await setup();
    const res = await create({ type: "discord", webhookUrl: DISCORD_URL });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain("Couldn't reach Discord");
  });

  it("accepts Slack webhook URLs by format", async () => {
    const { create } = await setup();
    expect((await create({ type: "slack", webhookUrl: SLACK_URL })).body.data.label).toBe("Slack webhook");
    expect((await create({ type: "slack", webhookUrl: "https://hooks.slack.com.evil.dev/services/x" })).status).toBe(422);
  });

  it("checks the Telegram chat exists", async () => {
    mockFetch((req) =>
      req.body?.chat_id === "-404" ? Response.json({ ok: false, description: "Bad Request: chat not found" }, { status: 400 }) : undefined,
    );
    const { create } = await setup();
    const ok = await create({ type: "telegram", botToken: TELEGRAM_TOKEN, chatId: "-100123" });
    expect(ok.body.data.label).toBe("Telegram · Leads");

    const missing = await create({ type: "telegram", botToken: TELEGRAM_TOKEN, chatId: "-404" });
    expect(missing.status).toBe(422);
    expect(missing.body.error.message).toContain("chat not found");

    expect((await create({ type: "telegram", botToken: "nope", chatId: "-1" })).status).toBe(422);
  });

  it("never returns stored secrets in listings", async () => {
    mockFetch();
    const { create, form, session } = await setup();
    await create({ type: "telegram", botToken: TELEGRAM_TOKEN, chatId: "-100123" });
    await create({ type: "discord", webhookUrl: DISCORD_URL });

    const list = await api<Data<ChannelDto[]>>(`/forms/${form.id}/channels`, { headers: session.headers });
    const json = JSON.stringify(list.body);
    expect(list.body.data).toHaveLength(2);
    expect(json).not.toContain(TELEGRAM_TOKEN);
    expect(json).not.toContain(DISCORD_URL);

    const stored = await db().select().from(channels).where(eq(channels.formId, form.id)).all();
    expect(stored.every((c) => c.configEnc.startsWith("v1:") && !c.configEnc.includes("discord.com"))).toBe(true);
  });

  it("rejects duplicate destinations", async () => {
    mockFetch();
    const { create } = await setup();
    await create({ type: "slack", webhookUrl: SLACK_URL });
    const dup = await create({ type: "slack", webhookUrl: SLACK_URL });
    expect(dup.status).toBe(409);
  });

  it("enforces the per-form channel limit", async () => {
    const { create } = await setup();
    for (let i = 0; i < 10; i++) {
      expect((await create({ type: "slack", webhookUrl: `${SLACK_URL}${i}` })).status).toBe(201);
    }
    expect((await create({ type: "slack", webhookUrl: `${SLACK_URL}x` })).body.error.code).toBe("channel_limit_reached");
  });
});

describe("webhook channels", () => {
  it("returns the signing secret once, and rotates it", async () => {
    const { create, session, form } = await setup();
    const res = await create({ type: "webhook", url: "https://hooks.example.com/sendm8?token=abc" });

    expect(res.status).toBe(201);
    expect(res.body.data.label).toBe("hooks.example.com/sendm8");
    const secret = res.body.data.secret!;
    expect(secret).toMatch(/^whsec_[\w-]{32}$/);

    const list = await api<Data<ChannelDto[]>>(`/forms/${form.id}/channels`, { headers: session.headers });
    expect(JSON.stringify(list.body)).not.toContain(secret);

    const rotated = await api<Data<CreatedChannelDto>>(`/channels/${res.body.data.id}/rotate-secret`, { method: "POST", headers: session.headers });
    expect(rotated.body.data.secret).toMatch(/^whsec_/);
    expect(rotated.body.data.secret).not.toBe(secret);

    // The next test delivery is signed with the new secret.
    const http = mockFetch();
    expect((await api(`/channels/${res.body.data.id}/test`, { method: "POST", headers: session.headers })).status).toBe(200);
    const [req] = http.to("hooks.example.com");
    const [, t, v1] = req!.headers.get("x-sendm8-signature")!.match(/^t=(\d+),v1=(\w+)$/)!;
    expect(v1).toBe(await hmacHex(rotated.body.data.secret!, `${t}.${req!.rawBody}`));
    expect(req!.body.event).toBe("test");
  });

  it.each([
    "http://hooks.example.com/",
    "https://127.0.0.1/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://sendm8.test/f/abc1234567",
    "https://localhost/hook",
  ])("blocks unsafe webhook URL %s", async (url) => {
    const { create } = await setup();
    const res = await create({ type: "webhook", url });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("channel_invalid");
  });

  it("only rotates secrets on webhook channels", async () => {
    const { create, session } = await setup();
    const slackChannel = await create({ type: "slack", webhookUrl: SLACK_URL });
    const res = await api<Err>(`/channels/${slackChannel.body.data.id}/rotate-secret`, { method: "POST", headers: session.headers });
    expect(res.status).toBe(422);
  });
});

describe("testing channels", () => {
  it("sends a test to Discord", async () => {
    const http = mockFetch();
    const { create, session } = await setup();
    const channel = await create({ type: "discord", webhookUrl: DISCORD_URL });
    const res = await api(`/channels/${channel.body.data.id}/test`, { method: "POST", headers: session.headers });

    expect(res.status).toBe(200);
    const post = http.to("discord.com").find((r) => r.method === "POST");
    expect(post!.body.embeds[0].title).toBe("[Test] New submission: Leads");
  });

  it("surfaces destination errors from a test", async () => {
    const { create, session } = await setup();
    const channel = await create({ type: "slack", webhookUrl: SLACK_URL });
    mockFetch(() => new Response("channel_is_archived", { status: 410 }));
    const res = await api<Err>(`/channels/${channel.body.data.id}/test`, { method: "POST", headers: session.headers });
    expect(res.status).toBe(502);
    expect(res.body.error.message).toContain("channel_is_archived");
  });

  it("rate limits channel tests per user", async () => {
    mockFetch();
    const { create, session } = await setup();
    const channel = await create({ type: "slack", webhookUrl: SLACK_URL });
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) {
      statuses.push((await api(`/channels/${channel.body.data.id}/test`, { method: "POST", headers: session.headers })).status);
    }
    expect(statuses).toContain(429);
  });
});
