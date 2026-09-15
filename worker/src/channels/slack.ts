import { z } from "zod";
import { postJson, truncate } from "./http";
import { formatBytes, notificationTitle, valueText, type ChannelDriver, type Notification } from "./types";

export interface SlackConfig {
  webhookUrl: string;
}

const WEBHOOK_URL = /^https:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9/_-]{10,200}$/;

const inputSchema = z.object({
  type: z.literal("slack"),
  webhookUrl: z.string().trim().max(300).regex(WEBHOOK_URL, "must be a Slack incoming webhook URL (https://hooks.slack.com/…)"),
});

/** Slack mrkdwn only needs &, < and > escaped; this also neutralises <!channel> style mentions. */
export const escapeSlack = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// Slack allows 50 blocks per message; keep room for header + context.
const MAX_FIELD_BLOCKS = 45;

export function slackBody(n: Notification) {
  const title = notificationTitle(n);
  const fieldBlocks = Object.entries(n.data)
    .slice(0, MAX_FIELD_BLOCKS)
    .map(([name, value]) => ({
      type: "section",
      text: { type: "mrkdwn", text: truncate(`*${escapeSlack(name)}*\n${escapeSlack(valueText(value)) || "_(empty)_"}`, 3000) },
    }));

  return {
    text: title,
    blocks: [
      { type: "header", text: { type: "plain_text", text: truncate(title, 150), emoji: false } },
      ...fieldBlocks,
      ...(n.files.length
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: truncate(`*Attachments*\n${n.files.map((f) => `<${f.url}|${escapeSlack(f.name).replaceAll("|", "¦")}> · ${formatBytes(f.size)}`).join("\n")}`, 3000),
              },
            },
          ]
        : []),
      { type: "context", elements: [{ type: "mrkdwn", text: `${escapeSlack(n.formName)} · <${n.submissionUrl}|Open in sendm8>` }] },
    ],
  };
}

export const slack: ChannelDriver<typeof inputSchema, SlackConfig> = {
  inputSchema,

  // Slack webhooks can't be inspected without posting, so the format check is all we can do here.
  async prepare(input) {
    return { ok: true, config: { webhookUrl: input.webhookUrl }, label: "Slack webhook" };
  },

  send(config, notification) {
    return postJson(config.webhookUrl, JSON.stringify(slackBody(notification)));
  },

  sameDestination: (a, b) => a.webhookUrl === b.webhookUrl,
};
