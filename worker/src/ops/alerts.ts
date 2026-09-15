import { waitUntil } from "cloudflare:workers";
import { postJson, truncate } from "../channels/http";
import { getLimits } from "../config";
import { dayKey } from "../lib/time";

/**
 * Alerts for whoever runs this instance, posted to ALERT_WEBHOOK_URL (a Discord or Slack webhook).
 * Every kind has a daily cap so a spam wave or a flood of errors can't bury the channel.
 */

export type AlertKind = "usage" | "error" | "signup" | "form_created" | "form_flagged" | "submission_held" | "system_email_failing";

export interface OpsAlert {
  kind: AlertKind;
  title: string;
  description?: string;
  fields?: { name: string; value: string }[];
  /** Dashboard path to act on it, e.g. "/app/admin#ad-reports". */
  path?: string;
  /** Only the first alert with this key is sent per `dedupeWindow`. */
  dedupeKey?: string;
  dedupeWindow?: "hour" | "day";
}

export type AlertEnv = Pick<Env, "DB" | "ALERT_WEBHOOK_URL" | "APP_URL" | "LIMITS_JSON">;

const STYLE: Record<AlertKind, { emoji: string; colour: number }> = {
  usage: { emoji: "⚠️", colour: 0xe0a100 },
  error: { emoji: "💥", colour: 0xcc3117 },
  signup: { emoji: "🎉", colour: 0x1f7a4a },
  form_created: { emoji: "📮", colour: 0x2b5fa8 },
  form_flagged: { emoji: "🚩", colour: 0xcc3117 },
  submission_held: { emoji: "✋", colour: 0xe0a100 },
  system_email_failing: { emoji: "📭", colour: 0xcc3117 },
};

/** Usage alerts are already once per metric, threshold and day, so they skip the daily cap. */
const UNCAPPED: ReadonlySet<AlertKind> = new Set(["usage"]);

/** Increments a counter unless it's at `limit`. Returns the new count, or null if the limit was reached. */
async function claim(db: D1Database, scope: string, scopeId: string, day: string, limit: number): Promise<number | null> {
  if (limit <= 0) return null;
  const row = await db
    .prepare(
      `INSERT INTO usage_daily (scope, scope_id, day, submissions, emails) VALUES (?1, ?2, ?3, 0, 1)
       ON CONFLICT (scope, scope_id, day) DO UPDATE SET emails = emails + 1 WHERE usage_daily.emails < ?4
       RETURNING emails`,
    )
    .bind(scope, scopeId, day, limit)
    .first<{ emails: number }>();
  return row?.emails ?? null;
}

/**
 * Posts an alert if a webhook is configured and the alert isn't a duplicate or over its daily cap.
 * Never throws. Returns whether it was sent.
 */
export async function notifyOps(env: AlertEnv, alert: OpsAlert, now = Date.now(), opts: { skipCounters?: boolean } = {}): Promise<boolean> {
  if (!env.ALERT_WEBHOOK_URL) return false;
  try {
    let muted = false;
    if (!opts.skipCounters) {
      const day = dayKey(now);
      if (alert.dedupeKey) {
        const window = alert.dedupeWindow === "hour" ? `:${new Date(now).getUTCHours()}` : "";
        if ((await claim(env.DB, "ops_alert_once", `${alert.kind}:${alert.dedupeKey}${window}`, day, 1)) === null) return false;
      }
      if (!UNCAPPED.has(alert.kind)) {
        const cap = getLimits(env).opsAlertsPerTypePerDay;
        const count = await claim(env.DB, "ops_alert", alert.kind, day, cap);
        if (count === null) return false;
        muted = count === cap;
      }
    }
    const result = await postJson(env.ALERT_WEBHOOK_URL, alertBody(env.ALERT_WEBHOOK_URL, alert, env.APP_URL, now, muted));
    if (!result.ok) console.error("ops alert not delivered", alert.kind, result.error);
    return result.ok;
  } catch (error) {
    console.error("ops alert failed", alert.kind, error);
    return false;
  }
}

/** Sends an alert after the response, without holding up the request. */
export function notifyOpsLater(env: AlertEnv, alert: OpsAlert): void {
  if (!env.ALERT_WEBHOOK_URL) return;
  waitUntil(notifyOps(env, alert));
}

/** Discord embed, or Slack text for hooks.slack.com URLs. */
export function alertBody(webhookUrl: string, alert: OpsAlert, appUrl: string | undefined, now: number, muted = false): string {
  const { emoji, colour } = STYLE[alert.kind];
  const link = alert.path && appUrl ? new URL(alert.path, appUrl).toString() : undefined;
  const mutedNote = muted ? "Daily limit for these alerts reached. More are muted until midnight UTC." : undefined;

  if (new URL(webhookUrl).hostname === "hooks.slack.com") {
    const lines = [`${emoji} *${alert.title}*`, alert.description, ...(alert.fields ?? []).map((f) => `*${f.name}:* ${f.value}`), link && `<${link}|Open in sendm8>`, mutedNote && `_${mutedNote}_`];
    return JSON.stringify({ text: truncate(lines.filter(Boolean).join("\n"), 3000) });
  }

  return JSON.stringify({
    username: "sendm8",
    // Form names and error messages are user-controlled: never let them ping anyone.
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: truncate(`${emoji} ${alert.title}`, 256),
        ...(alert.description && { description: truncate(alert.description, 3500) }),
        ...(link && { url: link }),
        color: colour,
        // Field values are data, so Markdown in them shows as typed (e.g. a cron "*/5 * * * *").
        fields: (alert.fields ?? []).slice(0, 10).map((f) => ({ name: truncate(f.name, 256), value: truncate(escapeMarkdown(f.value) || "—", 1000), inline: f.value.length <= 40 })),
        ...(mutedNote && { footer: { text: mutedNote } }),
        timestamp: new Date(now).toISOString(),
      },
    ],
  });
}

/** "ada@example.com" → "ad•••@example.com": enough to recognise, not enough to harvest. */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "—";
  const at = email.lastIndexOf("@");
  if (at < 1) return "•••";
  const local = email.slice(0, at);
  return `${local.slice(0, local.length > 3 ? 2 : 1)}•••${email.slice(at)}`;
}

/** One line of user text, without link or mention syntax (<@id>) or backticks that could break a code block. */
export const plain = (text: string, max = 200) => truncate(text.replace(/[`<>]/g, "").replace(/\s+/g, " ").trim(), max);

const escapeMarkdown = (text: string) => text.replace(/([\\*_~|])/g, "\\$1");
