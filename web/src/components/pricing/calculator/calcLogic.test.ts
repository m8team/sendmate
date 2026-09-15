import { describe, expect, it } from 'vitest';
import { limits } from '../../../config/site';
import {
  MAX_FORMS,
  PRESETS,
  STEPS,
  clampForms,
  digestLabel,
  estimate,
  modeOptions,
  ordinal,
  presetIndex,
  verdictFor,
  type CalcLimits,
} from './calcLogic';

/** Round numbers so the expectations read easily; the real limits are checked separately below. */
const L: CalcLimits = { emailsPerDay: 10, submissionsPerFormPerMonth: 1000, digestHourUtc: 17 };

describe('digestLabel', () => {
  it('formats the digest hour as 12-hour UTC', () => {
    expect(digestLabel(0)).toBe('12am UTC');
    expect(digestLabel(9)).toBe('9am UTC');
    expect(digestLabel(12)).toBe('12pm UTC');
    expect(digestLabel(17)).toBe('5pm UTC');
  });
});

describe('ordinal', () => {
  it('adds the right suffix', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
  });
});

describe('clampForms', () => {
  it('keeps a whole number between 1 and MAX_FORMS', () => {
    expect(clampForms(0)).toBe(1);
    expect(clampForms(-4)).toBe(1);
    expect(clampForms(2.6)).toBe(3);
    expect(clampForms(MAX_FORMS + 10)).toBe(MAX_FORMS);
    expect(clampForms(Number.NaN)).toBe(1);
  });
});

describe('presets', () => {
  it('only use values the slider can reach', () => {
    for (const p of PRESETS) expect(STEPS).toContain(p.perForm);
  });

  it('finds the preset matching the current values', () => {
    expect(presetIndex(12, 3)).toBe(1);
    expect(presetIndex(12, 4)).toBe(-1);
  });
});

describe('estimate', () => {
  it('caps instant email on our sender and holds the rest for the digest', () => {
    const e = estimate({ perForm: 6, forms: 3, mode: 'ours' }, L);
    expect(e).toMatchObject({ total: 18, instant: 10, overflow: 8, perMonth: 180, overMonth: false });
    expect(e.emailPct).toBe(100);
    expect(e.monthPct).toBeCloseTo(18);
  });

  it('sends everything with your own key and nothing with email off', () => {
    expect(estimate({ perForm: 6, forms: 3, mode: 'byok' }, L)).toMatchObject({ instant: 18, overflow: 0, emailPct: 0 });
    expect(estimate({ perForm: 6, forms: 3, mode: 'none' }, L)).toMatchObject({ instant: 0, overflow: 0, emailPct: 0 });
  });

  it('works out the day the monthly cap is passed', () => {
    const e = estimate({ perForm: 50, forms: 1, mode: 'none' }, L);
    expect(e.overMonth).toBe(true);
    expect(e.capDay).toBe(21);
    expect(e.monthPct).toBe(100);
    expect(estimate({ perForm: 0, forms: 1, mode: 'none' }, L).capDay).toBe(0);
  });
});

describe('verdictFor', () => {
  it('has nothing to weigh at zero', () => {
    expect(verdictFor({ perForm: 0, forms: 5, mode: 'ours' }, L)).toMatchObject({ tone: 'idle', stamp: 'Empty sack' });
  });

  it('flags the monthly cap first, and mentions the digest overflow too', () => {
    const v = verdictFor({ perForm: 50, forms: 2, mode: 'ours' }, L);
    expect(v.tone).toBe('signal');
    expect(v.head).toBe('You’d hit the monthly cap around the 21st.');
    expect(v.body).toContain('each of your 2 forms would pass 1,000 submissions');
    expect(v.body).toContain('about 90 emails a day would wait for your 5pm UTC digest');
    expect(verdictFor({ perForm: 50, forms: 1, mode: 'byok' }, L).body).not.toContain('Separately');
  });

  it('warns about overflow on our sender', () => {
    const v = verdictFor({ perForm: 4, forms: 3, mode: 'ours' }, L);
    expect(v).toMatchObject({ tone: 'warn', stamp: 'Overflow to digest' });
    expect(v.body).toContain('The first 10 emails each day arrive straight away. The other 2 turn up together in your 5pm UTC digest');
  });

  it('says all clear, with a heads-up when over half the cap', () => {
    expect(verdictFor({ perForm: 6, forms: 1, mode: 'ours' }, L)).toMatchObject({
      tone: 'ok',
      head: 'You’re fine. About 6 emails a day, under 10.',
      body: 'A day twice as busy would send about 2 of them to your 5pm UTC digest instead. Nothing would be dropped.',
    });
    expect(verdictFor({ perForm: 1, forms: 1, mode: 'ours' }, L).head).toBe('You’re fine. About 1 email a day, well under 10.');
    expect(verdictFor({ perForm: 2, forms: 1, mode: 'ours' }, L).head).toBe('You’re fine. About 2 emails a day, well under 10.');
  });

  it('covers your own key and no email', () => {
    expect(verdictFor({ perForm: 30, forms: 1, mode: 'byok' }, L)).toMatchObject({ stamp: 'No email cap', head: 'You’re fine. Your Resend key sends all 30 a day.' });
    expect(verdictFor({ perForm: 30, forms: 1, mode: 'none' }, L)).toMatchObject({ stamp: 'All clear', head: 'You’re fine. All 30 a day go straight to your channels.' });
  });
});

describe('modeOptions', () => {
  it('quotes the daily cap from site config', () => {
    expect(modeOptions(limits.emailsPerDay)[0].hint).toBe(`${limits.emailsPerDay} a day, free`);
  });
});
