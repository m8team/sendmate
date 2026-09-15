/** Maps API DTOs to the view models in types.ts, and view drafts back to API payloads. */
import type { ChannelDto, DailyStat, Delivery as DeliveryDto, EmailAddressDto, FieldValue, FormDto, SubmissionDto } from '@sendm8/shared';
import type { UpdateFormInput } from './endpoints';
import type { ChallengeMode, Channel, Delivery, DeliveryState, Form, NotifyMode, Submission, TurnstileMode } from './types';

// ── Small formatters ────────────────────────────────────────────────────────

/** "SM8 7Q2K 9F4X 3M": the last ten characters of the id, as shown on every parcel label. */
export function trackingNo(id: string) {
  const tail = id.slice(-10).toUpperCase();
  return `SM8 ${tail.slice(0, 4)} ${tail.slice(4, 8)} ${tail.slice(8)}`;
}

export const fieldText = (v: FieldValue | null | undefined) => (Array.isArray(v) ? v.join(', ') : (v ?? ''));

export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(['en-GB'], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** "Chrome 139 · Windows" from a raw user agent. Good enough for a postmark, not for analytics. */
export function describeUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const version = (re: RegExp) => ua.match(re)?.[1]?.split('.')[0];
  let browser: string | null = null;
  if (/Edg\//.test(ua)) browser = `Edge ${version(/Edg\/([\d.]+)/)}`;
  else if (/OPR\//.test(ua)) browser = `Opera ${version(/OPR\/([\d.]+)/)}`;
  else if (/Firefox\//.test(ua)) browser = `Firefox ${version(/Firefox\/([\d.]+)/)}`;
  else if (/Chrome\//.test(ua)) browser = `Chrome ${version(/Chrome\/([\d.]+)/)}`;
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = `Safari ${version(/Version\/([\d.]+)/)}`;
  else if (/^curl\//i.test(ua)) browser = 'curl';

  let os: string | null = null;
  if (/iPhone|iPad|iPod/.test(ua)) os = /iPad/.test(ua) ? 'iPad' : 'iPhone';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  if (!browser && !os) return ua.length > 60 ? `${ua.slice(0, 57)}…` : ua;
  return [browser, os].filter(Boolean).join(' · ');
}

/** "achterberg.studio/contact" from a referrer URL, or null for a direct visit. */
export function referrerLabel(ref: string | null | undefined): string | null {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    const path = u.pathname === '/' ? '' : u.pathname;
    return `${u.host.replace(/^www\./, '')}${path}`;
  } catch {
    return ref;
  }
}

/** The API reports spam reasons as short codes, e.g. `links:3`, `ai:97`. Unknown ones pass through. */
export function spamReasonLabel(reason: string) {
  const [code, arg] = reason.split(':', 2) as [string, string | undefined];
  const n = Number(arg);
  switch (code) {
    case 'ai':
      return Number.isFinite(n) && arg ? `AI double-check: ${Math.min(100, n)}% sure it’s spam` : 'AI double-check thought it looked like spam';
    case 'links':
      return `${arg ?? 'Lots of'} links in one message`;
    case 'phrases':
      return n === 1 ? 'A known spam phrase' : `${arg ?? 'Several'} known spam phrases`;
    case 'markup_links':
      return 'Links written as HTML or BBCode, a favourite of spam bots';
    case 'url_only_message':
      return 'The message is just a link';
    case 'honeypot':
      return 'The hidden honeypot field was filled in';
    case 'sensitive_field':
      return arg ? `Has a field that looks like it collects passwords or card details (“${arg}”)` : 'Has a field that looks like it collects passwords or card details';
    case 'form_flagged':
      return 'The form is flagged for review';
    default:
      return reason;
  }
}

const DELIVERY_ERRORS: Record<string, string> = {
  recipient_removed: 'the address was removed from your account',
  recipient_unverified: 'the address hasn’t been verified yet',
  byok_key_rejected: 'Resend rejected your API key, so it waits for the digest',
  instant_limit_reached: 'today’s instant emails were used up, so it waits for the digest',
  channel_type_unsupported: 'this kind of channel isn’t supported for this form',
};

/** Delivery errors are either a destination's own words or one of the Worker's short codes. */
export const deliveryErrorLabel = (error: string | null | undefined) => (error ? (DELIVERY_ERRORS[error] ?? error) : error);

/** Destinations sometimes answer with a whole HTML page; keep a readable first bit. */
export function clipText(text: string | null | undefined, max = 140) {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1000) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Forms ───────────────────────────────────────────────────────────────────

export function turnstileMode(dto: Pick<FormDto, 'turnstileConfigured' | 'settings'>): TurnstileMode {
  if (dto.turnstileConfigured) return 'byo';
  const c = dto.settings.challenge ?? 'suspicious';
  return c === 'off' ? 'off' : c === 'always' ? 'always' : 'challenge';
}

export const challengeFor = (mode: Exclude<TurnstileMode, 'byo'>): ChallengeMode => (mode === 'challenge' ? 'suspicious' : mode);

export function endpointBase(endpoint: string, id: string) {
  const bare = endpoint.replace(/^https?:\/\//, '');
  return bare.endsWith(id) ? bare.slice(0, bare.length - id.length) : bare.replace(/[^/]*$/, '');
}

export function toForm(dto: FormDto, stats?: DailyStat[] | number[]): Form {
  const daily = (stats ?? []).map((s) => (typeof s === 'number' ? s : s.submissions));
  return {
    id: dto.id,
    name: dto.name,
    status: dto.status,
    createdAt: dto.createdAt,
    endpoint: dto.endpoint,
    endpointBase: endpointBase(dto.endpoint, dto.id),
    emailEndpoint: dto.emailEndpoint,
    allowedOrigins: [...dto.allowedOrigins],
    redirectUrl: dto.redirectUrl,
    notify: (dto.settings.notifyMode ?? 'instant') as NotifyMode,
    challenge: dto.settings.challenge ?? 'suspicious',
    turnstile: turnstileMode(dto),
    turnstileConfigured: dto.turnstileConfigured,
    honeypotField: dto.settings.honeypotField ?? '',
    strictOrigin: dto.settings.strictOrigin ?? true,
    aiSpamScoring: dto.settings.aiSpamScoring ?? false,
    daily,
    monthCount: dto.submissionsThisMonth,
    monthlyLimit: dto.monthlyLimit,
    lastReceivedAt: dto.lastSubmissionAt,
    flag: dto.flaggedReason,
    counts: dto.counts ? { ...dto.counts } : null,
  };
}

export interface SettingsDraft {
  name: string;
  redirectUrl: string;
  allowedOrigins: string[];
  notify: NotifyMode;
  honeypotField: string;
  turnstile: TurnstileMode;
  turnstileSecret: string;
  aiSpamScoring: boolean;
}

export type TurnstileChange = { action: 'put'; secretKey: string } | { action: 'delete' } | null;

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Works out the smallest PATCH (plus any Turnstile secret change) that turns `form` into `draft`. */
export function buildFormPatch(form: Form, draft: SettingsDraft): { patch: UpdateFormInput | null; turnstile: TurnstileChange } {
  const patch: UpdateFormInput = {};
  const settings: NonNullable<UpdateFormInput['settings']> = {};

  const name = draft.name.trim();
  if (name !== form.name) patch.name = name;
  const redirect = draft.redirectUrl.trim() || null;
  if (redirect !== form.redirectUrl) patch.redirectUrl = redirect;
  if (!sameList(draft.allowedOrigins, form.allowedOrigins)) patch.allowedOrigins = [...draft.allowedOrigins];

  if (draft.notify !== form.notify) settings.notifyMode = draft.notify;
  const honeypot = draft.honeypotField.trim();
  if (honeypot && honeypot !== form.honeypotField) settings.honeypotField = honeypot;
  else if (!honeypot && form.honeypotField) settings.honeypotField = null;
  if (draft.aiSpamScoring !== form.aiSpamScoring) settings.aiSpamScoring = draft.aiSpamScoring;
  if (draft.turnstile !== 'byo') {
    const challenge = challengeFor(draft.turnstile);
    if (challenge !== form.challenge) settings.challenge = challenge;
  }
  if (Object.keys(settings).length) patch.settings = settings;

  let turnstile: TurnstileChange = null;
  const secret = draft.turnstileSecret.trim();
  if (draft.turnstile === 'byo' && secret) turnstile = { action: 'put', secretKey: secret };
  else if (draft.turnstile !== 'byo' && form.turnstileConfigured) turnstile = { action: 'delete' };

  return { patch: Object.keys(patch).length ? patch : null, turnstile };
}

// ── Channels & deliveries ───────────────────────────────────────────────────

export const toChannel = (dto: ChannelDto): Channel => ({
  id: dto.id,
  formId: dto.formId,
  type: dto.type,
  label: dto.label,
  enabled: dto.enabled,
  createdAt: dto.createdAt,
  ...(dto.recipientVerified !== undefined && { recipientVerified: dto.recipientVerified }),
  lastTest: dto.lastTest ?? null,
});

const DELIVERY_STATE: Record<DeliveryDto['status'], DeliveryState> = {
  sent: 'delivered',
  failed: 'retrying',
  digest: 'digest',
  skipped: 'failed',
};

export function toDelivery(d: DeliveryDto, channels: Channel[]): Delivery {
  const channel = channels.find((c) => c.id === d.channelId);
  return {
    channelId: d.channelId,
    type: channel?.type ?? null,
    label: channel?.label ?? 'Removed channel',
    status: DELIVERY_STATE[d.status] ?? 'failed',
    viaDigest: Boolean(d.viaDigest),
    attempts: d.attempts,
    at: d.at,
    ...(d.error && { error: d.error }),
  };
}

// ── Submissions ─────────────────────────────────────────────────────────────

export function toSubmission(dto: SubmissionDto, channels: Channel[], read = false): Submission {
  return {
    id: dto.id,
    formId: dto.formId,
    tracking: trackingNo(dto.id),
    createdAt: dto.createdAt,
    data: Object.fromEntries(Object.entries(dto.data).map(([k, v]) => [k, fieldText(v)])),
    raw: dto.data,
    special: dto.special ?? {},
    files: dto.files ?? [],
    droppedFiles: dto.droppedFiles ?? [],
    meta: {
      country: dto.country,
      countryName: countryName(dto.country),
      userAgent: dto.userAgent,
      browser: describeUserAgent(dto.userAgent),
      referrer: referrerLabel(dto.referrer),
    },
    spamScore: dto.spamScore,
    spamReasons: dto.spamReasons ?? [],
    status: dto.status,
    starred: dto.starred,
    read,
    deliveries: (dto.deliveries ?? []).map((d) => toDelivery(d, channels)),
    retryAt: dto.retryAt ?? null,
  };
}

/** Field names seen across some submissions, in first-seen order. Underscore fields are left out. */
export function fieldNamesFrom(subs: Pick<SubmissionDto, 'data'>[]) {
  const names = new Set<string>();
  subs.forEach((s) => Object.keys(s.data).forEach((k) => !k.startsWith('_') && names.add(k)));
  return [...names];
}

// ── Email addresses & Resend sender ─────────────────────────────────────────

/** The API allows one verification email per address every 10 minutes. */
export const RESEND_COOLDOWN_MS = 10 * 60_000;

/** Milliseconds until another verification email can be sent (0 when it can go now). */
export function resendCooldownLeft(address: Pick<EmailAddressDto, 'verified' | 'verificationSentAt'>, now: number, cooldownMs = RESEND_COOLDOWN_MS) {
  if (address.verified || !address.verificationSentAt) return 0;
  return Math.max(0, address.verificationSentAt + cooldownMs - now);
}

/** "9:05" for a countdown. */
export function countdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export interface FromParts {
  name: string;
  local: string;
  domain: string;
}

/** Splits `Your Name <hello@example.com>` or `hello@example.com` into parts. */
export function splitFrom(from: string | null | undefined): FromParts {
  const value = (from ?? '').trim();
  const m = value.match(/^(?:([^<>]*?)\s*<([^<>]+)>|([^<>\s]+))$/);
  const name = (m?.[1] ?? '').trim().replace(/^"|"$/g, '');
  const address = (m?.[2] ?? m?.[3] ?? '').trim();
  const at = address.lastIndexOf('@');
  return at > 0 ? { name, local: address.slice(0, at), domain: address.slice(at + 1).toLowerCase() } : { name, local: address, domain: '' };
}

export function joinFrom({ name, local, domain }: FromParts) {
  const address = `${local.trim()}@${domain.trim()}`;
  const n = name.trim().replace(/[<>"\r\n]/g, '');
  return n ? `${n} <${address}>` : address;
}

// ── Admin ───────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** Whole percent, capped at 100, for meters. */
export const percent = (used: number, limit: number) => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);
