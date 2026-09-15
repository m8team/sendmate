import { z } from "zod";
import { escapeHtml } from "../lib/http";
import { truncate, type ChannelResult } from "./http";
import { formatBytes, notificationTitle, valueText, type ChannelDriver, type Notification } from "./types";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

const inputSchema = z.object({
  type: z.literal("telegram"),
  botToken: z
    .string()
    .trim()
    .regex(/^\d{5,15}:[A-Za-z0-9_-]{30,50}$/, "must be a bot token from @BotFather"),
  chatId: z
    .string()
    .trim()
    .regex(/^-?\d{1,20}$|^@[A-Za-z][A-Za-z0-9_]{4,31}$/, "must be a numeric chat id or @channelusername"),
});

const MAX_MESSAGE = 4096;

interface TelegramResponse<T> {
  ok: boolean;
  description?: string;
  result?: T;
}

type ApiResult<T> = { ok: true; result: T } | { ok: false; status: number; description: string };

async function callApi<T>(token: string, method: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    const json = (await res.json().catch(() => ({ ok: false }))) as TelegramResponse<T>;
    if (res.ok && json.ok) return { ok: true, result: json.result as T };
    return { ok: false, status: res.status, description: json.description ?? res.statusText };
  } catch {
    // Don't surface the thrown error: the request URL contains the bot token.
    return { ok: false, status: 0, description: "network error" };
  }
}

export function telegramText(n: Notification): string {
  const head = `<b>${escapeHtml(notificationTitle(n))}</b>`;
  const files = n.files.map((f) => `📎 <a href="${escapeHtml(f.url)}">${escapeHtml(truncate(f.name, 80))}</a> · ${formatBytes(f.size)}`).join("\n");
  const foot = `${files ? `${files}\n\n` : ""}<a href="${escapeHtml(n.submissionUrl)}">Open in sendm8</a>`;
  const budget = MAX_MESSAGE - head.length - foot.length - 20;

  const parts: string[] = [];
  let used = 0;
  for (const [name, value] of Object.entries(n.data)) {
    // Truncate raw text before escaping so we never cut an entity or tag in half.
    const part = `<b>${escapeHtml(truncate(name, 100))}</b>\n${escapeHtml(truncate(valueText(value) || "(empty)", 1000))}`;
    if (used + part.length + 2 > budget) {
      parts.push("…");
      break;
    }
    parts.push(part);
    used += part.length + 2;
  }
  return [head, ...parts, foot].join("\n\n");
}

export const telegram: ChannelDriver<typeof inputSchema, TelegramConfig> = {
  inputSchema,

  async prepare(input) {
    const chat = await callApi<{ title?: string; username?: string; first_name?: string }>(input.botToken, "getChat", { chat_id: input.chatId });
    if (!chat.ok) {
      return { ok: false, error: `Telegram couldn't find that chat (${chat.description}). Add the bot to the chat first.` };
    }
    const name = chat.result.title ?? (chat.result.username ? `@${chat.result.username}` : chat.result.first_name) ?? input.chatId;
    return { ok: true, config: { botToken: input.botToken, chatId: input.chatId }, label: `Telegram · ${truncate(name, 60)}` };
  },

  async send(config, notification): Promise<ChannelResult> {
    const result = await callApi(config.botToken, "sendMessage", {
      chat_id: config.chatId,
      text: telegramText(notification),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    if (result.ok) return { ok: true };
    const retryable = result.status === 0 || result.status === 429 || result.status >= 500;
    return { ok: false, error: `${result.status || ""} ${result.description}`.trim().slice(0, 200), retryable };
  },

  sameDestination: (a, b) => a.botToken === b.botToken && a.chatId === b.chatId,
};
