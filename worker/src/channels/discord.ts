import { z } from "zod";
import { postJson, truncate, USER_AGENT } from "./http";
import { formatBytes, notificationTitle, valueText, type ChannelDriver, type Notification } from "./types";

export interface DiscordConfig {
  webhookUrl: string;
}

const WEBHOOK_URL = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d{17,20}\/[\w-]{60,100}\/?$/;

const inputSchema = z.object({
  type: z.literal("discord"),
  webhookUrl: z.string().trim().max(300).regex(WEBHOOK_URL, "must be a Discord webhook URL (Channel settings → Integrations → Webhooks)"),
});

// Discord embed limits: https://discord.com/developers/docs/resources/message#embed-object-embed-limits
const MAX_FIELDS = 25;
const MAX_EMBED_CHARS = 5_800;

export function discordBody(n: Notification) {
  const title = truncate(notificationTitle(n), 256);
  let total = title.length;
  const fields: { name: string; value: string; inline: boolean }[] = [];
  for (const [name, value] of Object.entries(n.data).slice(0, MAX_FIELDS)) {
    const field = { name: truncate(name, 256) || "(unnamed)", value: truncate(valueText(value) || "(empty)", 1024), inline: false };
    if (total + field.name.length + field.value.length > MAX_EMBED_CHARS) break;
    total += field.name.length + field.value.length;
    fields.push(field);
  }

  if (n.files.length && fields.length < MAX_FIELDS) {
    // Markdown link text can't contain brackets, so they're stripped from file names.
    const links = n.files.map((f) => `[${f.name.replace(/[[\]]/g, "")}](${f.url}) · ${formatBytes(f.size)}`).join("\n");
    fields.push({ name: "Attachments", value: truncate(links, 1024), inline: false });
  }

  return {
    username: "sendm8",
    // Never let submitted content ping @everyone, roles or users.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title,
        url: n.submissionUrl,
        color: 0xe8412c,
        fields,
        footer: { text: `${n.formName} · sendm8` },
        timestamp: new Date(n.createdAt).toISOString(),
      },
    ],
  };
}

export const discord: ChannelDriver<typeof inputSchema, DiscordConfig> = {
  inputSchema,

  async prepare(input) {
    try {
      const res = await fetch(input.webhookUrl, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5_000) });
      if (!res.ok) return { ok: false, error: "Discord doesn't recognise that webhook. Check it hasn't been deleted." };
      const webhook = (await res.json()) as { name?: string };
      return { ok: true, config: { webhookUrl: input.webhookUrl }, label: `Discord · ${truncate(webhook.name ?? "webhook", 60)}` };
    } catch {
      return { ok: false, error: "Couldn't reach Discord. Try again in a moment." };
    }
  },

  send(config, notification) {
    return postJson(config.webhookUrl, JSON.stringify(discordBody(notification)));
  },

  sameDestination: (a, b) => a.webhookUrl === b.webhookUrl,
};
