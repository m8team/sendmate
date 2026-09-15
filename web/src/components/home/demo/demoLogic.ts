/**
 * Pure logic behind the homepage demo: validation, the toy spam check, tracking numbers
 * and the copy that narrates each stage. No DOM, no timers, so it's easy to test.
 */

export type Stage = 'idle' | 'received' | 'checked' | 'stored' | 'delivered' | 'binned';

export interface DocketFields {
  name: string;
  email: string;
  message: string;
  _gotcha: string;
}

export type DocketErrors = Partial<Record<'name' | 'email' | 'message', string>>;

export interface SentParcel {
  name: string;
  email: string;
  message: string;
  at: string;
  tracking: string;
}

/** Scores at or above this are binned instead of delivered. */
export const SPAM_THRESHOLD = 0.5;

/** When each stage lands, in ms after "Send it". Spam stops at `binned` (same time as `stored`). */
export const STAGE_TIMINGS = { received: 250, checked: 1050, stored: 1900, delivered: 2750 } as const;

const ORDER: Stage[] = ['idle', 'received', 'checked', 'stored', 'delivered'];

/** Has the parcel reached station `s`? Spam only ever gets as far as the spam check. */
export function hasReached(current: Stage, s: Stage): boolean {
  if (current === 'binned') return s === 'received' || s === 'checked';
  return ORDER.indexOf(current) >= ORDER.indexOf(s);
}

/** How far along the conveyor the red line has drawn, 0–1. */
export function progressFor(stage: Stage): number {
  if (stage === 'binned') return 0.36;
  return { idle: 0, received: 0.1, checked: 0.36, stored: 0.64, delivered: 1 }[stage];
}

export function validateDocket(form: DocketFields): DocketErrors {
  const errors: DocketErrors = {};
  if (!form.name.trim()) errors.name = 'Who’s it from? Add a name.';
  if (!form.email.trim()) errors.email = 'We need an email to reply to.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'That email doesn’t look quite right.';
  if (!form.message.trim()) errors.message = 'Say something, even just “hi”.';
  return errors;
}

const SPAM_PHRASES = ['crypto', 'bitcoin', 'guaranteed', 'seo', 'casino', 'viagra', 'free money', 'page 1'];

/** A toy version of the real heuristics, so the demo can explain itself. */
export function spamCheck(form: DocketFields, rand: () => number = Math.random): { score: number; why: string[] } {
  const why: string[] = [];
  let s = 0.02 + rand() * 0.04;
  const text = `${form.name} ${form.message}`.toLowerCase();
  if (form._gotcha) {
    s += 0.6;
    why.push('Honeypot field was filled in');
  }
  const links = (form.message.match(/https?:\/\//g) || []).length;
  if (links >= 2) {
    s += 0.2;
    why.push(`${links} links in a short message`);
  }
  const phrases = SPAM_PHRASES.filter((p) => text.includes(p));
  if (phrases.length) {
    s += 0.15 + phrases.length * 0.05;
    why.push(`Spammy phrases: ${phrases.slice(0, 3).map((p) => `“${p}”`).join(', ')}`);
  }
  if (/@(mailinator|tempmail|guerrillamail|10minutemail)\./i.test(form.email)) {
    s += 0.2;
    why.push('Disposable email domain');
  }
  return { score: Math.min(0.99, Math.round(s * 100) / 100), why };
}

const TRACKING_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `SM8 7Q2K 9F4X 3M`: Crockford-ish, no I, L, O or U. */
export function makeTracking(rand: () => number = Math.random): string {
  const r = (n: number) => Array.from({ length: n }, () => TRACKING_ALPHABET[Math.floor(rand() * TRACKING_ALPHABET.length)]).join('');
  return `SM8 ${r(4)} ${r(4)} ${r(2)}`;
}

export function statusText(stage: Stage, ctx: { busy: boolean; tracking: string; receivedAt: string; score: number }): string {
  switch (stage) {
    case 'idle':
      return ctx.busy ? 'Posting…' : 'Waiting for post. Fill in the docket and hit send.';
    case 'received':
      return `Received ${ctx.tracking} at ${ctx.receivedAt}.`;
    case 'checked':
      return `Spam check: score ${ctx.score.toFixed(2)}.`;
    case 'stored':
      return 'Stored in the dashboard inbox.';
    case 'delivered':
      return 'Delivered to email and Discord.';
    case 'binned':
      return `Marked as spam, score ${ctx.score.toFixed(2)}. Kept in the spam folder, not delivered.`;
  }
}

/** Up to two initials for the little avatar in the Discord embed footer. */
export function initialsOf(name: string | undefined): string {
  return (name || 'A')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Ease-out cubic, used by the counting score. */
export function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}
