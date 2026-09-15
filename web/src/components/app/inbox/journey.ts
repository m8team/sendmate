/**
 * Pure logic for the submission detail: the parcel stamp, the delivery journey steps,
 * the reply link and the spam gauge label. No DOM.
 */
import type { IconName } from '../../ui/icons';
import type { Delivery, Form, Submission } from '../../../lib/api/types';
import { clipText, deliveryErrorLabel } from '../../../lib/api/adapters';
import { DAY, SPAM_LINE, channelIcon, channelName, dayMonth, digestTime, hhmm, hhmmss, inMinutes, postmark, verdict } from '../InboxUtils';

export type Tone = 'done' | 'bad' | 'warn' | 'wait' | 'skip';

export interface Step {
  key: string;
  tone: Tone;
  icon: IconName;
  title: string;
  tag?: { text: string; cls: string };
  time?: string;
  lines: string[];
  target?: string;
  /** Failed or retrying delivery: offer "Retry now". */
  retryable?: boolean;
}

export const TONE_ICON: Record<Tone, IconName> = { done: 'check', bad: 'x', warn: 'refresh', wait: 'clock', skip: 'minus' };

/** The rubber stamp on the parcel label. */
export function stampFor(s: Submission): { text: string; cls: string } {
  if (s.status === 'spam') return { text: 'Return to sender', cls: 'stamp-ink' };
  if (s.status === 'held') return { text: 'Held', cls: 'stamp-warn' };
  if (s.status === 'pending_challenge') return { text: 'Waiting', cls: 'stamp-warn' };
  const ds = s.deliveries;
  if (!ds.length) return { text: 'Filed', cls: 'stamp-ink' };
  if (ds.some((d) => d.status === 'failed')) return { text: ds.some((d) => d.status === 'delivered') ? 'Part delivered' : 'Undelivered', cls: 'stamp-warn' };
  if (ds.some((d) => d.status === 'retrying')) return { text: 'In transit', cls: 'stamp-warn' };
  if (ds.every((d) => d.status === 'digest')) return { text: 'Queued', cls: 'stamp-ink' };
  return { text: 'Delivered', cls: '' };
}

/** Destinations sometimes answer with a whole HTML page; keep the first bit. */
const clip = (err?: string) => clipText(deliveryErrorLabel(err)) || 'no response';

/** "Discord · #leads", without repeating the channel name when the label already starts with it. */
export function deliveryTitle(d: Delivery) {
  const name = channelName(d.type);
  return d.label && d.label !== name ? `${name} · ${d.label.replace(new RegExp(`^${name} · `), '')}` : name;
}

export interface JourneyContext {
  formId: string;
  formStatus: Form['status'];
  now: number;
  digestHourUtc: number;
  spamRetentionDays: number;
  maxDeliveryAttempts: number;
}

function checkStep(s: Submission): Step {
  const score = s.spamScore.toFixed(2);
  const base = { key: 'check', icon: 'shield' as const, title: 'Spam-checked' };
  if (s.status === 'held') return { ...base, tone: 'warn', tag: { text: 'Held', cls: 'tag-warn' }, lines: [`Score ${score}. Held for review, so it stopped here.`] };
  if (s.status === 'pending_challenge')
    return { ...base, tone: 'wait', tag: { text: 'Captcha', cls: 'tag-warn' }, lines: [`Score ${score}. Looked a bit suspicious, so the visitor was asked to pass a quick captcha first.`] };
  if (s.status === 'spam')
    return { ...base, tone: 'bad', tag: { text: 'Spam', cls: 'tag-signal' }, lines: [`Score ${score}${s.spamScore >= SPAM_LINE ? `, over the ${SPAM_LINE.toFixed(2)} line.` : '. You marked it as spam.'}`] };
  if (s.spamScore >= SPAM_LINE) return { ...base, tone: 'warn', tag: { text: 'Let through', cls: 'tag-warn' }, lines: [`Score ${score}, over the line, but you said it’s not spam.`] };
  return { ...base, tone: 'done', tag: { text: 'Clean', cls: 'tag-ok' }, lines: [`Score ${score}. ${verdict(s).word}.`] };
}

function storedLine(s: Submission, spamRetentionDays: number) {
  if (s.status === 'spam') return `Filed under spam. Deleted for good around ${dayMonth(s.createdAt + spamRetentionDays * DAY)} unless you rescue it.`;
  if (s.status === 'held') return 'Filed under held, safe and unsent.';
  if (s.status === 'pending_challenge') return 'Waiting for the visitor to pass the captcha. It’s delivered as soon as they do.';
  return 'Filed in this inbox.';
}

function deliveryStep(s: Submission, d: Delivery, ctx: JourneyContext): Step | null {
  const base = { key: d.channelId, icon: channelIcon(d.type), title: deliveryTitle(d) };
  switch (d.status) {
    case 'delivered': {
      if (d.viaDigest) return { ...base, tone: 'done', tag: { text: 'In digest', cls: 'tag-ok' }, time: `${dayMonth(d.at)}, ${hhmm(d.at)} UTC`, lines: [`Went out in the ${dayMonth(d.at)} digest.`] };
      const took = (d.at - s.createdAt) / 1000;
      return {
        ...base,
        tone: 'done',
        tag: { text: 'Delivered', cls: 'tag-ok' },
        time: `${hhmmss(d.at)} UTC`,
        lines: [d.attempts > 1 ? `Got there on attempt ${d.attempts}.` : took >= 0 && took < 3600 ? `Took ${took.toFixed(1)}s.` : 'Delivered.'],
      };
    }
    case 'digest': {
      const t = digestTime(s.createdAt, ctx.digestHourUtc);
      const due = t > ctx.now;
      return {
        ...base,
        tone: 'wait',
        tag: { text: 'Digest', cls: '' },
        time: due ? `due ${hhmm(t)} UTC` : 'next digest',
        lines: [due ? `Arrives in the digest at ${hhmm(t)} UTC, bundled with the rest of the day’s post.` : 'Queued for the next digest email.'],
      };
    }
    case 'retrying': {
      const next = s.retryAt;
      return {
        ...base,
        tone: 'warn',
        tag: { text: 'Retrying', cls: 'tag-warn' },
        time: next ? `next ${hhmm(next)} UTC` : `${hhmm(d.at)} UTC`,
        lines: [
          `Attempt ${d.attempts} of ${ctx.maxDeliveryAttempts} failed: ${clip(d.error)}`,
          next && next > ctx.now ? `Trying again automatically at ${hhmm(next)} UTC, in ${inMinutes(next - ctx.now)}.` : next ? 'The next automatic try is due now.' : 'We’ll keep trying automatically.',
        ],
        retryable: true,
      };
    }
    case 'failed':
      return {
        ...base,
        tone: 'bad',
        tag: { text: 'Failed', cls: 'tag-signal' },
        time: `${hhmmss(d.at)} UTC`,
        lines: [`Not delivered: ${clip(d.error)}`, d.attempts > 1 ? `Gave up after ${d.attempts} attempts.` : 'It won’t be retried automatically.'],
        retryable: true,
      };
    default:
      return null;
  }
}

/** Received → spam-checked → stored → one step per channel, like a parcel tracking page. */
export function journeySteps(s: Submission, ctx: JourneyContext): Step[] {
  const origin = [s.meta.countryName ? `From ${s.meta.countryName}` : 'From somewhere unknown', s.meta.referrer ? `via ${s.meta.referrer}` : 'no referrer'].join(', ');
  const out: Step[] = [
    { key: 'received', tone: 'done', icon: 'arrow-down', title: 'Received', time: postmark(s.createdAt), target: `POST /f/${ctx.formId}`, lines: [`${origin}.`] },
    checkStep(s),
    { key: 'stored', tone: 'done', icon: 'inbox', title: 'Stored', lines: [storedLine(s, ctx.spamRetentionDays)] },
  ];
  if (s.status === 'spam' || s.status === 'held' || s.status === 'pending_challenge') return out;

  for (const d of s.deliveries) {
    const step = deliveryStep(s, d, ctx);
    if (step) out.push(step);
  }
  if (!s.deliveries.length && ctx.formStatus === 'pending_confirmation') {
    out.push({ key: 'confirm', tone: 'skip', icon: 'send', title: 'Delivery', tag: { text: 'On hold', cls: '' }, lines: ['Nothing goes out until the address is confirmed.'] });
  } else if (!s.deliveries.length) {
    out.push({ key: 'none', tone: 'skip', icon: 'send', title: 'Delivery', tag: { text: 'Inbox only', cls: '' }, lines: ['No channels were switched on, so it’s only here.'] });
  }
  return out;
}

/** A mailto: link that quotes the message back, like a mail client's reply. */
export function replyMailto(s: Submission, email: string, who: string, formName: string) {
  const first = Object.entries(s.data).find(([k]) => k === 'message' || k === 'steps')?.[1] ?? '';
  const quoted = first
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  const subject = s.special._subject ? `Re: ${s.special._subject}` : `Re: your message via ${formName}`;
  const body = `\n\n---\nOn ${dayMonth(s.createdAt)}, ${who} wrote:\n${quoted}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function gaugeLabel(s: Submission) {
  return `Spam score ${s.spamScore.toFixed(2)} out of 1. Anything from ${SPAM_LINE.toFixed(2)} up counts as spam. Verdict: ${verdict(s).word}.`;
}
