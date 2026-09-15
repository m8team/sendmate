import { describe, expect, it } from 'vitest';
import {
  easeOutCubic,
  hasReached,
  initialsOf,
  makeTracking,
  progressFor,
  SPAM_THRESHOLD,
  spamCheck,
  STAGE_TIMINGS,
  statusText,
  validateDocket,
  type DocketFields,
  type Stage,
} from './demoLogic';

const human: DocketFields = {
  name: 'Alex Moreno',
  email: 'alex@moreno.dev',
  message: 'Hiya! Loved the portfolio. Are you free for a quick project in October?',
  _gotcha: '',
};
const bot: DocketFields = {
  name: 'Top SEO Deals',
  email: 'winner@mailinator.com',
  message: 'GUARANTEED page 1 on Google + FREE crypto!! https://spam.example https://bit.ly/x',
  _gotcha: 'http://i-am-a-bot.example',
};

describe('hasReached', () => {
  it('follows the station order for good post', () => {
    expect(hasReached('idle', 'received')).toBe(false);
    expect(hasReached('received', 'received')).toBe(true);
    expect(hasReached('checked', 'stored')).toBe(false);
    expect(hasReached('stored', 'checked')).toBe(true);
    const all: Stage[] = ['received', 'checked', 'stored', 'delivered'];
    expect(all.every((s) => hasReached('delivered', s))).toBe(true);
  });

  it('stops spam after the spam check', () => {
    expect(hasReached('binned', 'received')).toBe(true);
    expect(hasReached('binned', 'checked')).toBe(true);
    expect(hasReached('binned', 'stored')).toBe(false);
    expect(hasReached('binned', 'delivered')).toBe(false);
  });
});

describe('progressFor', () => {
  it('draws the line further at each stage', () => {
    const stages: Stage[] = ['idle', 'received', 'checked', 'stored', 'delivered'];
    const values = stages.map(progressFor);
    expect(values[0]).toBe(0);
    expect(values[4]).toBe(1);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it('leaves spam at the spam-check station', () => {
    expect(progressFor('binned')).toBe(progressFor('checked'));
  });
});

describe('validateDocket', () => {
  it('accepts a complete docket', () => {
    expect(validateDocket(human)).toEqual({});
  });

  it('flags every empty field, ignoring whitespace', () => {
    const errors = validateDocket({ name: '  ', email: '', message: '\n', _gotcha: '' });
    expect(Object.keys(errors)).toEqual(['name', 'email', 'message']);
    expect(errors.email).toMatch(/email to reply to/);
  });

  it('rejects an email that is not shaped like one', () => {
    expect(validateDocket({ ...human, email: 'alex@moreno' }).email).toMatch(/doesn’t look quite right/);
    expect(validateDocket({ ...human, email: 'alex moreno@x.dev' }).email).toBeDefined();
  });
});

describe('spamCheck', () => {
  const noJitter = () => 0;

  it('lets a nice human through with a low score', () => {
    const { score, why } = spamCheck(human, noJitter);
    expect(score).toBe(0.02);
    expect(score).toBeLessThan(SPAM_THRESHOLD);
    expect(why).toEqual([]);
  });

  it('bins the spam bot and says why', () => {
    const { score, why } = spamCheck(bot, noJitter);
    expect(score).toBe(0.99);
    expect(score).toBeGreaterThanOrEqual(SPAM_THRESHOLD);
    expect(why).toEqual([
      'Honeypot field was filled in',
      '2 links in a short message',
      'Spammy phrases: “crypto”, “guaranteed”, “seo”',
      'Disposable email domain',
    ]);
  });

  it('scores each signal on its own', () => {
    expect(spamCheck({ ...human, _gotcha: 'x' }, noJitter).score).toBe(0.62);
    expect(spamCheck({ ...human, message: 'see http://a and https://b' }, noJitter).score).toBe(0.22);
    expect(spamCheck({ ...human, email: 'x@tempmail.com' }, noJitter).score).toBe(0.22);
    expect(spamCheck({ ...human, message: 'bitcoin' }, noJitter).score).toBe(0.22);
  });

  it('only adds a little random jitter', () => {
    expect(spamCheck(human, () => 0.999).score).toBe(0.06);
  });
});

describe('makeTracking', () => {
  it('formats a tracking number', () => {
    for (let i = 0; i < 50; i++) expect(makeTracking()).toMatch(/^SM8 [0-9A-HJKMNP-TV-Z]{4} [0-9A-HJKMNP-TV-Z]{4} [0-9A-HJKMNP-TV-Z]{2}$/);
  });

  it('is deterministic for a given random source', () => {
    expect(makeTracking(() => 0)).toBe('SM8 0000 0000 00');
    expect(makeTracking(() => 0.9999)).toBe('SM8 ZZZZ ZZZZ ZZ');
  });
});

describe('statusText', () => {
  const ctx = { busy: false, tracking: 'SM8 AAAA BBBB CC', receivedAt: '09:41:07', score: 0.5 };

  it('narrates every stage', () => {
    expect(statusText('idle', ctx)).toMatch(/^Waiting for post/);
    expect(statusText('idle', { ...ctx, busy: true })).toBe('Posting…');
    expect(statusText('received', ctx)).toBe('Received SM8 AAAA BBBB CC at 09:41:07.');
    expect(statusText('checked', ctx)).toBe('Spam check: score 0.50.');
    expect(statusText('stored', ctx)).toBe('Stored in the dashboard inbox.');
    expect(statusText('delivered', ctx)).toBe('Delivered to email and Discord.');
    expect(statusText('binned', { ...ctx, score: 0.97 })).toBe('Marked as spam, score 0.97. Kept in the spam folder, not delivered.');
  });
});

describe('initialsOf', () => {
  it('takes up to two initials, upper-cased', () => {
    expect(initialsOf('alex moreno')).toBe('AM');
    expect(initialsOf('Mary Jane Watson')).toBe('MJ');
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf(undefined)).toBe('A');
  });
});

describe('timings and easing', () => {
  it('runs the stages in order', () => {
    const t = STAGE_TIMINGS;
    expect(t.received).toBeLessThan(t.checked);
    expect(t.checked).toBeLessThan(t.stored);
    expect(t.stored).toBeLessThan(t.delivered);
  });

  it('eases out from 0 to 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
