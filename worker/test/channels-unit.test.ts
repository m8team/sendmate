import { describe, expect, it } from "vitest";
import { discordBody } from "../src/channels/discord";
import { classify, truncate } from "../src/channels/http";
import { escapeSlack, slackBody } from "../src/channels/slack";
import { telegramText } from "../src/channels/telegram";
import type { Notification } from "../src/channels/types";
import { signWebhook, webhookPayload } from "../src/channels/webhook";
import { hmacHex } from "../src/lib/crypto";
import { checkOutboundUrl } from "../src/lib/ssrf";

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    formId: "abc1234567",
    formName: "Contact",
    submissionId: "01sub",
    createdAt: Date.UTC(2026, 8, 15, 10, 0, 0),
    data: { name: "Ada", message: "Hello" },
    subject: null,
    replyTo: "ada@example.com",
    referrer: "https://site.dev/contact",
    country: "GB",
    submissionUrl: "https://sendm8.test/app/forms/abc1234567?submission=01sub",
    isTest: false,
    files: [],
    ...overrides,
  };
}

describe("checkOutboundUrl", () => {
  it.each([
    "https://hooks.example.com/sendm8",
    "https://example.com:8443/hook?token=abc",
    "https://93.184.216.34/hook",
    "https://[2606:4700::1111]/hook",
    "https://[::ffff:5db8:d822]/hook",
  ])("allows %s", (url) => {
    expect(checkOutboundUrl(url, "sendm8.com").ok).toBe(true);
  });

  it.each([
    ["http://example.com/hook", "https://"],
    ["not a url", "valid URL"],
    ["https://user:pass@example.com/", "credentials"],
    ["https://example.com:22/", "port"],
    ["https://localhost/hook", "public hostname"],
    ["https://intranet/hook", "public hostname"],
    ["https://printer.local/", "public hostname"],
    ["https://db.internal/", "public hostname"],
    ["https://127.0.0.1/", "private"],
    ["https://10.1.2.3/", "private"],
    ["https://172.20.0.1/", "private"],
    ["https://192.168.1.10/", "private"],
    ["https://169.254.169.254/latest/meta-data", "private"],
    ["https://100.64.0.1/", "private"],
    ["https://0.0.0.0/", "private"],
    ["https://[::1]/", "private"],
    ["https://[fd00::1]/", "private"],
    ["https://[fe80::1]/", "private"],
    ["https://[::ffff:10.0.0.1]/", "private"],
    ["https://[::ffff:a9fe:a9fe]/", "private"],
    ["https://[64:ff9b::7f00:1]/", "private"],
    ["https://sendm8.com/f/abc", "sendm8"],
    ["https://api.sendm8.com/f/abc", "sendm8"],
  ])("blocks %s", (url, reason) => {
    const result = checkOutboundUrl(url, "sendm8.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reason);
  });
});

describe("classify", () => {
  it.each([
    [200, true, false],
    [204, true, false],
    [301, false, false],
    [400, false, false],
    [404, false, false],
    [408, false, true],
    [429, false, true],
    [500, false, true],
    [503, false, true],
  ])("status %i → ok=%s retryable=%s", async (status, ok, retryable) => {
    const result = await classify(new Response(status === 204 ? null : "detail", { status }));
    expect(result.ok).toBe(ok);
    if (!result.ok) expect(result.retryable).toBe(retryable);
  });

  it("truncates long strings with an ellipsis", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });
});

describe("discord", () => {
  it("renders an embed and never allows mentions", () => {
    const body = discordBody(notification({ data: { message: "@everyone free nitro", tags: ["a", "b"], empty: "" } }));
    expect(body.allowed_mentions).toEqual({ parse: [] });
    const [embed] = body.embeds;
    expect(embed!.title).toBe("New submission: Contact");
    expect(embed!.url).toContain("submission=01sub");
    expect(embed!.fields).toEqual([
      { name: "message", value: "@everyone free nitro", inline: false },
      { name: "tags", value: "a, b", inline: false },
      { name: "empty", value: "(empty)", inline: false },
    ]);
  });

  it("stays inside Discord's field and size limits", () => {
    const data = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`field${i}`, "x".repeat(2000)]));
    const [embed] = discordBody(notification({ data, subject: "s".repeat(400), isTest: true })).embeds;
    expect(embed!.title.length).toBeLessThanOrEqual(256);
    expect(embed!.title.startsWith("[Test] ")).toBe(true);
    expect(embed!.fields.length).toBeLessThanOrEqual(25);
    const chars = embed!.title.length + embed!.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    expect(chars).toBeLessThanOrEqual(6000);
    expect(embed!.fields.every((f) => f.value.length <= 1024)).toBe(true);
  });
});

describe("slack", () => {
  it("escapes mrkdwn control characters so mentions can't be injected", () => {
    expect(escapeSlack("<!channel> & <@U123>")).toBe("&lt;!channel&gt; &amp; &lt;@U123&gt;");
    const body = slackBody(notification({ data: { message: "<!here> hi", "*bold*": "" } }));
    const texts = body.blocks.map((b: any) => b.text?.text ?? b.elements?.[0]?.text);
    expect(texts[1]).toBe("*message*\n&lt;!here&gt; hi");
    expect(texts[2]).toBe("**bold**\n_(empty)_");
    expect(texts.at(-1)).toContain("<https://sendm8.test/app/forms/abc1234567?submission=01sub|Open in sendm8>");
    expect(body.text).toBe("New submission: Contact");
  });

  it("caps blocks under Slack's limit", () => {
    const data = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`f${i}`, "v"]));
    expect(slackBody(notification({ data })).blocks.length).toBeLessThanOrEqual(50);
  });
});

describe("telegram", () => {
  it("escapes HTML in field names and values", () => {
    const text = telegramText(notification({ data: { "<b>name": "<script>&" } }));
    expect(text).toContain("<b>&lt;b&gt;name</b>\n&lt;script&gt;&amp;");
    expect(text).toContain('<a href="https://sendm8.test/app/forms/abc1234567?submission=01sub">Open in sendm8</a>');
  });

  it("stays under the 4096 character message limit", () => {
    const data = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`field${i}`, "<&>".repeat(500)]));
    const text = telegramText(notification({ data }));
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain("…");
    expect(text).toMatch(/Open in sendm8<\/a>$/);
  });
});

describe("webhooks", () => {
  it("builds a stable payload", () => {
    expect(webhookPayload(notification({ subject: "Hi" }))).toEqual({
      event: "submission.created",
      form: { id: "abc1234567", name: "Contact" },
      submission: {
        id: "01sub",
        createdAt: "2026-09-15T10:00:00.000Z",
        data: { name: "Ada", message: "Hello" },
        subject: "Hi",
        replyTo: "ada@example.com",
        referrer: "https://site.dev/contact",
        country: "GB",
        files: [],
      },
    });
    expect(webhookPayload(notification({ isTest: true })).event).toBe("test");
  });

  it("signs as t=<ts>,v1=HMAC(secret, ts.body)", async () => {
    const signature = await signWebhook("whsec_test", '{"a":1}', 1_700_000_000);
    expect(signature).toBe(`t=1700000000,v1=${await hmacHex("whsec_test", '1700000000.{"a":1}')}`);
    expect(signature).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });
});
