/**
 * Channel + settings validation shared by onboarding and form settings.
 * Checked in the browser first for instant feedback; the API validates again (and tests the
 * destination), and its errors are shown inline too.
 */
import type { ChannelType } from '../../lib/api/types';

export type AddableChannel = Exclude<ChannelType, 'email'>;

export const channelMeta: Record<ChannelType, { name: string; icon: 'mail' | 'discord' | 'slack' | 'telegram' | 'webhook' }> = {
  email: { name: 'Email', icon: 'mail' },
  discord: { name: 'Discord', icon: 'discord' },
  slack: { name: 'Slack', icon: 'slack' },
  telegram: { name: 'Telegram', icon: 'telegram' },
  webhook: { name: 'Webhook', icon: 'webhook' },
};

export interface ChannelDraft {
  url: string;
  botToken: string;
  chatId: string;
}

export const emptyChannelDraft = (): ChannelDraft => ({ url: '', botToken: '', chatId: '' });

export type ChannelErrors = Partial<Record<keyof ChannelDraft, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());

function parseUrl(v: string) {
  try {
    return new URL(v.trim());
  } catch {
    return null;
  }
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal)$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function validateChannel(type: AddableChannel, d: ChannelDraft): ChannelErrors {
  const e: ChannelErrors = {};
  const url = d.url.trim();
  if (type === 'discord') {
    if (!url) e.url = 'Paste the webhook URL from Discord.';
    else if (!/^https:\/\/(canary\.|ptb\.)?(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(url))
      e.url = 'That isn’t a Discord webhook. It should start with https://discord.com/api/webhooks/';
  } else if (type === 'slack') {
    if (!url) e.url = 'Paste the incoming webhook URL from Slack.';
    else if (!/^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[A-Za-z0-9/_-]{10,200}$/.test(url))
      e.url = 'That isn’t a Slack incoming webhook. It should start with https://hooks.slack.com/services/';
  } else if (type === 'telegram') {
    if (!d.botToken.trim()) e.botToken = 'Paste the token @BotFather gave you.';
    else if (!/^\d{5,15}:[A-Za-z0-9_-]{30,50}$/.test(d.botToken.trim())) e.botToken = 'Bot tokens look like 123456789:AAH…, a number, a colon, then a long string.';
    if (!d.chatId.trim()) e.chatId = 'Which chat should we post to?';
    else if (!/^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(d.chatId.trim())) e.chatId = 'Use a numeric chat id (e.g. -1001234567890) or a public @channelname.';
  } else if (type === 'webhook') {
    const u = parseUrl(url);
    if (!url) e.url = 'Where should we POST each submission?';
    else if (!u) e.url = 'That doesn’t look like a URL. Include the https:// bit.';
    else if (u.protocol !== 'https:') e.url = 'Webhooks have to use https://, so submissions aren’t sent in the clear.';
    else if (IPV4.test(u.hostname) || u.hostname.startsWith('[')) e.url = 'Use a hostname, not an IP address. We block raw IPs to keep private networks private.';
    else if (PRIVATE_HOST.test(u.hostname)) e.url = 'We can’t reach localhost or internal hostnames from the internet. Use a public URL.';
  }
  return e;
}

/** Display-only masking, like the API returns. */
export function maskTarget(type: AddableChannel, d: ChannelDraft) {
  const url = d.url.trim();
  if (type === 'discord') {
    const m = url.match(/webhooks\/(\d+)\/([\w-]+)/);
    return m ? `discord.com/api/webhooks/${m[1].slice(0, 4)}…/•••• ${m[2].slice(-3)}` : url;
  }
  if (type === 'slack') {
    const m = url.match(/services\/([\w]+)\/.*?([\w]{3})$/);
    return m ? `hooks.slack.com/services/${m[1].slice(0, 3)}…/•••• ${m[2]}` : url;
  }
  if (type === 'telegram') {
    const [bot] = d.botToken.split(':');
    const chat = d.chatId.trim();
    const chatMasked = chat.startsWith('@') ? chat : `${chat.slice(0, 2)}•••••${chat.slice(-2)}`;
    return `Bot ${bot.slice(0, 3)}••• → chat ${chatMasked}`;
  }
  return url;
}

export const placeholders: Record<AddableChannel, string> = {
  discord: 'https://discord.com/api/webhooks/1182…/…',
  slack: 'https://hooks.slack.com/services/T04…/B07…/…',
  telegram: '',
  webhook: 'https://api.example.com/hooks/sendm8',
};

export const hints: Record<AddableChannel, string> = {
  discord: 'In Discord: Server settings → Integrations → Webhooks → New webhook → Copy URL.',
  slack: 'In Slack: add the “Incoming Webhooks” app, pick a channel, copy the URL.',
  telegram: 'Message @BotFather, send /newbot, then add your bot to the chat you want pinged.',
  webhook: 'We POST JSON to this URL, signed with your secret. Public https only.',
};

/** Domain chips: accept pasted URLs, keep just the hostname. */
export function normaliseDomain(v: string) {
  let s = v.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
  return s;
}
export const isDomain = (v: string) => /^(\*\.)?(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v);

/** Redirects must stay on an allowed domain (or a subdomain of one), so they can't be an open redirect. */
export function validateRedirect(url: string, allowed: string[]): string | undefined {
  const v = url.trim();
  if (!v) return undefined;
  const u = parseUrl(v);
  if (!u || !/^https?:$/.test(u.protocol)) return 'That doesn’t look like a full URL. Start it with https://';
  if (u.protocol !== 'https:') return 'Use https:// so visitors don’t get a browser warning on the way back.';
  // With no allowed domains the form takes posts from anywhere, so any https redirect is fine.
  if (!allowed.length) return undefined;
  const host = u.hostname.toLowerCase();
  const ok = allowed.some((raw) => {
    const d = raw.replace(/^\*\./, '');
    return host === d || host.endsWith(`.${d}`);
  });
  if (!ok) return `${host} isn’t on your allowed domains list. Add it below, or redirect to ${allowed[0]}.`;
  return undefined;
}

/** Deterministic decorative bars for a string (same idea as brand/Barcode.astro). */
export function barsFor(value: string) {
  let seed = 0;
  for (const ch of value) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (const w of [1, 1, 1]) {
    bars.push({ x, w });
    x += w * 2;
  }
  while (x < 150) {
    const w = rand() < 0.62 ? 1 : rand() < 0.7 ? 2 : 3;
    bars.push({ x, w });
    x += w + (rand() < 0.6 ? 1 : 2);
  }
  for (const w of [1, 1, 1]) {
    bars.push({ x, w });
    x += w * 2;
  }
  return { bars, width: x };
}

/** "18:00 UTC" from limits.digestHourUtc */
export const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00 UTC`;
