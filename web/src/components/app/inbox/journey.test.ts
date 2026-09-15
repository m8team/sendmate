import { describe, expect, it } from 'vitest';
import type { Delivery, Submission } from '../../../lib/api/types';
import { deliveryTitle, gaugeLabel, journeySteps, replyMailto, stampFor, type JourneyContext } from './journey';

const T0 = Date.UTC(2026, 8, 14, 15, 35, 2);

const delivery = (over: Partial<Delivery> = {}): Delivery => ({
  channelId: 'ch1',
  type: 'email',
  label: 'Email',
  status: 'delivered',
  viaDigest: false,
  attempts: 1,
  at: T0 + 1200,
  ...over,
});

const sub = (over: Partial<Submission> = {}): Submission => ({
  id: 's1',
  formId: 'f1',
  tracking: 'SM8 7Q2K 9F4X 3M',
  createdAt: T0,
  data: { name: 'Ada', email: 'ada@example.com', message: 'Hello\nthere' },
  raw: {},
  special: {},
  files: [],
  droppedFiles: [],
  meta: { country: 'GB', countryName: 'United Kingdom', userAgent: null, browser: null, referrer: 'example.com/contact' },
  spamScore: 0.05,
  spamReasons: [],
  status: 'ok',
  starred: false,
  read: true,
  deliveries: [delivery()],
  retryAt: null,
  ...over,
});

const ctx: JourneyContext = { formId: 'f1', formStatus: 'active', now: T0 + 60_000, digestHourUtc: 18, spamRetentionDays: 30, maxDeliveryAttempts: 5 };

describe('stampFor', () => {
  it('stamps each outcome', () => {
    expect(stampFor(sub()).text).toBe('Delivered');
    expect(stampFor(sub({ status: 'spam' })).text).toBe('Return to sender');
    expect(stampFor(sub({ status: 'held' }))).toEqual({ text: 'Held', cls: 'stamp-warn' });
    expect(stampFor(sub({ status: 'pending_challenge' })).text).toBe('Waiting');
    expect(stampFor(sub({ deliveries: [] })).text).toBe('Filed');
    expect(stampFor(sub({ deliveries: [delivery(), delivery({ status: 'failed' })] })).text).toBe('Part delivered');
    expect(stampFor(sub({ deliveries: [delivery({ status: 'failed' })] })).text).toBe('Undelivered');
    expect(stampFor(sub({ deliveries: [delivery({ status: 'retrying' })] })).text).toBe('In transit');
    expect(stampFor(sub({ deliveries: [delivery({ status: 'digest' })] })).text).toBe('Queued');
  });
});

describe('journeySteps', () => {
  it('traces a delivered submission', () => {
    const steps = journeySteps(sub(), ctx);
    expect(steps.map((s) => s.key)).toEqual(['received', 'check', 'stored', 'ch1']);
    expect(steps[0]).toMatchObject({ time: '14 SEP 15:35:02 UTC', target: 'POST /f/f1', lines: ['From United Kingdom, via example.com/contact.'] });
    expect(steps[1]).toMatchObject({ tone: 'done', tag: { text: 'Clean' }, lines: ['Score 0.05. Looks human.'] });
    expect(steps[3]).toMatchObject({ tone: 'done', time: '15:35:03 UTC', lines: ['Took 1.2s.'] });
  });

  it('stops at storage for spam, held and captcha post', () => {
    const spam = journeySteps(sub({ status: 'spam', spamScore: 0.9 }), ctx);
    expect(spam.map((s) => s.key)).toEqual(['received', 'check', 'stored']);
    expect(spam[1].lines[0]).toBe('Score 0.90, over the 0.80 line.');
    expect(spam[2].lines[0]).toBe('Filed under spam. Deleted for good around 14 Oct unless you rescue it.');
    expect(journeySteps(sub({ status: 'held' }), ctx)[1].tag?.text).toBe('Held');
    expect(journeySteps(sub({ status: 'pending_challenge' }), ctx)).toHaveLength(3);
  });

  it('marks failed and retrying deliveries as retryable', () => {
    const steps = journeySteps(
      sub({
        retryAt: T0 + 30 * 60_000,
        deliveries: [delivery({ status: 'retrying', attempts: 2, error: 'recipient_unverified' }), delivery({ channelId: 'ch2', type: 'discord', label: 'Discord · #leads', status: 'failed', error: '<html>\n  boom </html>' })],
      }),
      ctx,
    );
    expect(steps[3]).toMatchObject({ tone: 'warn', retryable: true, time: 'next 16:05 UTC' });
    expect(steps[3].lines).toEqual(['Attempt 2 of 5 failed: the address hasn’t been verified yet', 'Trying again automatically at 16:05 UTC, in 29 min.']);
    expect(steps[4]).toMatchObject({ tone: 'bad', retryable: true, title: 'Discord · #leads', lines: ['Not delivered: <html> boom </html>', 'It won’t be retried automatically.'] });
  });

  it('says when a digest is due', () => {
    const steps = journeySteps(sub({ deliveries: [delivery({ status: 'digest' })] }), ctx);
    expect(steps[3]).toMatchObject({ tone: 'wait', time: 'due 18:00 UTC' });
  });

  it('explains missing deliveries', () => {
    expect(journeySteps(sub({ deliveries: [] }), ctx)[3]).toMatchObject({ key: 'none', tag: { text: 'Inbox only' } });
    expect(journeySteps(sub({ deliveries: [] }), { ...ctx, formStatus: 'pending_confirmation' })[3]).toMatchObject({ key: 'confirm', tag: { text: 'On hold' } });
  });
});

describe('deliveryTitle', () => {
  it('does not repeat the channel name', () => {
    expect(deliveryTitle(delivery({ type: 'discord', label: 'Discord · #leads' }))).toBe('Discord · #leads');
    expect(deliveryTitle(delivery({ type: 'slack', label: '#sales' }))).toBe('Slack · #sales');
    expect(deliveryTitle(delivery({ type: 'email', label: 'Email' }))).toBe('Email');
    expect(deliveryTitle(delivery({ type: null, label: '' }))).toBe('Channel');
  });
});

describe('replyMailto', () => {
  it('quotes the message back', () => {
    const url = replyMailto(sub(), 'ada@example.com', 'Ada', 'Contact');
    const [to, query] = url.split('?');
    const params = new URLSearchParams(query);
    expect(to).toBe('mailto:ada@example.com');
    expect(params.get('subject')).toBe('Re: your message via Contact');
    expect(params.get('body')).toBe('\n\n---\nOn 14 Sep, Ada wrote:\n> Hello\n> there');
  });

  it('replies to the form subject when there is one', () => {
    const url = replyMailto(sub({ special: { _subject: 'Quote' } }), 'ada@example.com', 'Ada', 'Contact');
    expect(new URLSearchParams(url.split('?')[1]).get('subject')).toBe('Re: Quote');
  });
});

describe('gaugeLabel', () => {
  it('reads the score out', () => {
    expect(gaugeLabel(sub({ spamScore: 0.4 }))).toBe('Spam score 0.40 out of 1. Anything from 0.80 up counts as spam. Verdict: A bit suspicious.');
  });
});
