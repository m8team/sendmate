/**
 * Pure helpers for the submission inbox. No DOM, no Intl month names
 * (ICU differs between Node and browsers, which would break hydration).
 */
import type { ChannelType, Submission } from '../../lib/api/types';
import { limits } from '../../config/site';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** Score at or above which a submission is treated as spam (mirrors worker/src/pipeline/spam.ts). */
export const SPAM_LINE = 0.8;
/** Score at which browser posts get the Turnstile challenge, when it's on. */
export const SUSPICIOUS_LINE = 0.35;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

export const hhmm = (t: number | string) => {
  const d = new Date(t);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
export const hhmmss = (t: number | string) => {
  const d = new Date(t);
  return `${hhmm(t)}:${pad(d.getUTCSeconds())}`;
};
export const dayMonth = (t: number | string) => {
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
/** "14 SEP 15:35:02 UTC" */
export const postmark = (t: number | string) => `${dayMonth(t).toUpperCase()} ${hhmmss(t)} UTC`;
export const isoDate = (t: number) => new Date(t).toISOString();

export function inMinutes(ms: number) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))} min`;
  return `${Math.round(ms / HOUR)} h`;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function replyTo(s: Submission) {
  const e = (s.special._replyto || s.data._replyto || s.data.email || '').trim();
  return EMAIL_RE.test(e) ? e : null;
}

export function sender(s: Submission) {
  if (s.status === 'held') return 'Held for review';
  const name = s.data.name?.trim();
  if (name) return name;
  const email = s.data.email?.trim();
  if (email) return email;
  const first = Object.values(s.data).find((v) => v.trim());
  return first?.trim() || 'Anonymous';
}

export function preview(s: Submission) {
  if (s.status === 'held') return `Fields: ${Object.keys(s.data).join(', ')}`;
  if (s.data.message?.trim()) return s.data.message.trim();
  const who = sender(s);
  return Object.entries(s.data)
    .filter(([k, v]) => v.trim() && k !== 'name' && k !== 'email' && !k.startsWith('_') && v.trim() !== who)
    .map(([, v]) => v.trim().replace(/\s+/g, ' '))
    .join(' · ');
}

export function verdict(s: Submission) {
  if (s.status === 'held') return { word: 'Held for review', tone: 'warn' as const };
  if (s.status === 'pending_challenge') return { word: 'Waiting for a captcha', tone: 'warn' as const };
  if (s.status === 'spam') return s.spamScore >= SPAM_LINE ? { word: 'Spam', tone: 'bad' as const } : { word: 'Marked as spam by you', tone: 'bad' as const };
  if (s.spamScore >= SPAM_LINE) return { word: 'Spammy, but you let it through', tone: 'warn' as const };
  if (s.spamScore >= SUSPICIOUS_LINE) return { word: 'A bit suspicious', tone: 'warn' as const };
  if (s.spamScore >= 0.15) return { word: 'Probably fine', tone: 'ok' as const };
  return { word: 'Looks human', tone: 'ok' as const };
}

/** When the daily digest containing this submission goes (or went) out. */
export function digestTime(createdAt: number | string, digestHourUtc: number = limits.digestHourUtc) {
  const d = new Date(createdAt);
  let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), digestHourUtc);
  if (d.getTime() >= t) t += DAY;
  return t;
}

export function channelIcon(type: ChannelType | null) {
  if (!type) return 'send' as const;
  return ({ email: 'mail', discord: 'discord', slack: 'slack', telegram: 'telegram', webhook: 'webhook' } as const)[type];
}
export function channelName(type: ChannelType | null) {
  if (!type) return 'Channel';
  return ({ email: 'Email', discord: 'Discord', slack: 'Slack', telegram: 'Telegram', webhook: 'Webhook' } as const)[type];
}

/** A submission as the API shape (plus tracking number), for "Copy JSON". */
export function toJson(s: Submission) {
  const { id, tracking, createdAt, status, spamScore, spamReasons, starred, raw, special, files, meta, deliveries } = s;
  return JSON.stringify(
    {
      id,
      tracking,
      createdAt: isoDate(createdAt),
      status,
      spamScore,
      spamReasons,
      starred,
      data: raw,
      special,
      files: files.map(({ field, name, size, type }) => ({ field, name, size, type })),
      country: meta.country,
      referrer: meta.referrer,
      userAgent: meta.userAgent,
      deliveries: deliveries.map((d) => ({ channel: d.label, status: d.status, attempts: d.attempts, at: isoDate(d.at), ...(d.error && { error: d.error }) })),
    },
    null,
    2,
  );
}

/** Deterministic decorative barcode widths from a tracking number. */
export function barcode(tracking: string) {
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const ch of tracking.replace(/\s/g, '')) {
    const c = ch.charCodeAt(0);
    for (let i = 0; i < 3; i++) {
      const w = ((c >> i) & 3) + 1;
      bars.push({ x, w });
      x += w + (((c >> (i + 2)) & 1) + 1);
    }
  }
  return { bars, width: x };
}

export function ago(t: number | string, now: number) {
  const d = now - new Date(t).getTime();
  if (d < MIN) return 'just now';
  if (d < HOUR) return `${Math.round(d / MIN)} min ago`;
  if (d < DAY) return `${Math.round(d / HOUR)} h ago`;
  if (d < 2 * DAY) return 'yesterday';
  if (d < 30 * DAY) return `${Math.round(d / DAY)} days ago`;
  return dayMonth(t);
}
