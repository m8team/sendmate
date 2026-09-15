/**
 * The maths behind the pricing calculator: how much post a typical day brings, where it goes,
 * and the plain-words verdict. Pure functions, so the numbers can be tested without Vue.
 */
import { fmt } from '../../../config/site';

export type Mode = 'ours' | 'byok' | 'none';
export type Tone = 'ok' | 'warn' | 'signal' | 'idle';

/** Non-linear slider: fine steps where most forms live, bigger jumps further out. */
export const STEPS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300];
export const MAX_FORMS = 50;

export interface Preset {
  label: string;
  perForm: number;
  forms: number;
}

export const PRESETS: Preset[] = [
  { label: 'A portfolio', perForm: 2, forms: 1 },
  { label: 'A small business', perForm: 12, forms: 3 },
  { label: 'A busy shop', perForm: 25, forms: 5 },
  { label: 'Launch week', perForm: 60, forms: 2 },
];

/** The limits the calculator quotes (from `config/site.ts`). */
export interface CalcLimits {
  emailsPerDay: number;
  submissionsPerFormPerMonth: number;
  digestHourUtc: number;
}

export interface CalcInput {
  perForm: number;
  forms: number;
  mode: Mode;
}

export interface Estimate {
  /** Submissions a day across every form. */
  total: number;
  /** Emails that go out straight away. */
  instant: number;
  /** Emails held for the daily digest. */
  overflow: number;
  /** Submissions a month, per form. */
  perMonth: number;
  overMonth: boolean;
  /** Day of the month the monthly cap would be passed. */
  capDay: number;
  /** How full our sender's daily cap is, 0–100. */
  emailPct: number;
  /** How full the monthly cap is, 0–100. */
  monthPct: number;
}

export interface Verdict {
  tone: Tone;
  stamp: string;
  head: string;
  body: string;
}

/** `9` → `9am UTC`, `17` → `5pm UTC`. */
export const digestLabel = (hourUtc: number) => `${hourUtc % 12 || 12}${hourUtc < 12 ? 'am' : 'pm'} UTC`;

/** Rounded and grouped, e.g. `1,200`. */
export const n = (v: number) => fmt.n(Math.round(v));

export const ordinal = (d: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Keeps the form count a whole number between 1 and MAX_FORMS. */
export const clampForms = (v: number) => Math.min(MAX_FORMS, Math.max(1, Math.round(Number.isFinite(v) ? v : 1)));

/** The preset matching the current values, or -1. */
export const presetIndex = (perForm: number, forms: number) => PRESETS.findIndex((p) => p.perForm === perForm && p.forms === forms);

export function estimate({ perForm, forms, mode }: CalcInput, limits: CalcLimits): Estimate {
  const cap = limits.emailsPerDay;
  const monthCap = limits.submissionsPerFormPerMonth;
  const total = perForm * forms;
  const perMonth = perForm * 30;
  return {
    total,
    instant: mode === 'ours' ? Math.min(total, cap) : mode === 'byok' ? total : 0,
    overflow: mode === 'ours' ? Math.max(0, total - cap) : 0,
    perMonth,
    overMonth: perMonth > monthCap,
    capDay: perForm ? Math.ceil((monthCap + 1) / perForm) : 0,
    emailPct: mode === 'ours' ? Math.min(100, (total / cap) * 100) : 0,
    monthPct: Math.min(100, (perMonth / monthCap) * 100),
  };
}

export function verdictFor(input: CalcInput, limits: CalcLimits): Verdict {
  const { forms, mode } = input;
  const { total: t, overflow, perMonth, overMonth, capDay } = estimate(input, limits);
  const cap = limits.emailsPerDay;
  const monthCap = limits.submissionsPerFormPerMonth;
  const digestAt = digestLabel(limits.digestHourUtc);
  const formsWord = forms === 1 ? 'your form' : `each of your ${forms} forms`;

  if (t === 0) {
    return { tone: 'idle', stamp: 'Empty sack', head: 'Nothing to weigh yet.', body: 'Drag the slider or pick an example to see where you’d land.' };
  }

  if (overMonth) {
    return {
      tone: 'signal',
      stamp: 'Over the cap',
      head: `You’d hit the monthly cap around the ${ordinal(capDay)}.`,
      body: `At about ${n(perMonth)} a month, ${formsWord} would pass ${n(monthCap)} submissions. After that, new submissions are rejected with a clear error until the 1st. Self-hosting has no cap, or get in touch and tell us what you’re building.${
        mode === 'ours' && t > cap ? ` Separately, about ${n(overflow)} emails a day would wait for your ${digestAt} digest.` : ''
      }`,
    };
  }

  if (mode === 'ours' && t > cap) {
    return {
      tone: 'warn',
      stamp: 'Overflow to digest',
      head: 'You’d go over our sender on busy days.',
      body: `The first ${n(cap)} emails each day arrive straight away. The other ${n(overflow)} turn up together in your ${digestAt} digest, so nothing’s lost. Or add your Resend key and forget about it.`,
    };
  }

  if (mode === 'ours' && t > cap * 0.5) {
    return {
      tone: 'ok',
      stamp: 'All clear',
      head: `You’re fine. About ${n(t)} emails a day, under ${n(cap)}.`,
      body: `A day twice as busy would send about ${n(t * 2 - cap)} of them to your ${digestAt} digest instead. Nothing would be dropped.`,
    };
  }

  if (mode === 'byok') {
    return {
      tone: 'ok',
      stamp: 'No email cap',
      head: `You’re fine. Your Resend key sends all ${n(t)} a day.`,
      body: 'From your own domain, with no cap from us. Resend’s own plan decides how many you can send.',
    };
  }

  if (mode === 'none') {
    return {
      tone: 'ok',
      stamp: 'All clear',
      head: `You’re fine. All ${n(t)} a day go straight to your channels.`,
      body: 'Discord, Slack, Telegram and webhooks aren’t capped, and neither is your dashboard inbox.',
    };
  }

  return {
    tone: 'ok',
    stamp: 'All clear',
    head: `You’re fine. About ${n(t)} email${t === 1 ? '' : 's'} a day, well under ${n(cap)}.`,
    body: 'You won’t come near any of the limits. Carry on.',
  };
}

export const modeOptions = (cap: number): { value: Mode; label: string; hint: string }[] => [
  { value: 'ours', label: 'Our email sender', hint: `${cap} a day, free` },
  { value: 'byok', label: 'My own Resend key', hint: 'No cap from us' },
  { value: 'none', label: 'No email', hint: 'Discord, Slack, webhooks' },
];
