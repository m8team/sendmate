import { describe, expect, it } from 'vitest';
import type { AdminUsageDto } from '@sendm8/shared';
import { blockTypes, disableReasonFor, errorContext, errorSourceLabel, meterPct, occurrences, usageTiles, validateBlock, validateSuspension } from './adminRules';

const usage: AdminUsageDto = {
  day: '2026-09-15',
  submissions: 1234,
  systemEmails: 45,
  systemEmailLimit: 100,
  estimatedWrites: 91_000,
  topForms: [],
  storageBytes: 0,
  storageLimitBytes: 10 * 1024 ** 3,
  databaseBytes: 400 * 1024 ** 2,
  databaseLimitBytes: 500 * 1024 ** 2,
};

describe('usageTiles', () => {
  it('builds the tiles in order', () => {
    expect(usageTiles(usage).map((t) => t.key)).toEqual(['subs', 'writes', 'email', 'storage', 'database']);
  });

  it('measures the database against its size cap, or shows a dash when D1 gave no size', () => {
    expect(usageTiles(usage)[4]).toMatchObject({ pct: 80 });
    expect(usageTiles({ ...usage, databaseBytes: null })[4]).toMatchObject({ value: '—', pct: null });
  });

  it('shows submissions without a cap', () => {
    const [subs] = usageTiles(usage);
    expect(subs).toMatchObject({ value: '1,234', of: '', pct: null, note: 'UTC day 2026-09-15' });
  });

  it('measures writes and emails against their caps', () => {
    const [, writes, email] = usageTiles(usage);
    expect(writes).toMatchObject({ value: '91,000', of: '/100k', pct: 91 });
    expect(email).toMatchObject({ value: '45', of: '/100', pct: 45 });
  });

  it('formats storage in bytes', () => {
    const storage = usageTiles(usage)[3];
    expect(storage.pct).toBe(0);
    expect(storage.of).toMatch(/^\//);
  });
});

describe('errors', () => {
  it('orders context with the most useful keys first and drops blanks', () => {
    expect(errorContext({ browser: 'Chrome 140 on Windows', zeta: 'z', where: 'request', alpha: 'a', route: '/api/forms', info: '' })).toEqual([
      ['where', 'request'],
      ['route', '/api/forms'],
      ['browser', 'Chrome 140 on Windows'],
      ['alpha', 'a'],
      ['zeta', 'z'],
    ]);
  });

  it('labels sources and counts', () => {
    expect(errorSourceLabel.browser).toBe('Browser');
    expect(occurrences(1)).toBe('Seen once');
    expect(occurrences(1204)).toBe('Seen 1,204 times');
  });
});

describe('meterPct', () => {
  it('keeps a visible sliver for tiny usage', () => {
    expect(meterPct(0)).toBe(0);
    expect(meterPct(1)).toBe(2);
    expect(meterPct(45)).toBe(45);
  });
});

describe('disableReasonFor', () => {
  it('prefills the reason, except for "other"', () => {
    expect(disableReasonFor({ reason: 'phishing' })).toBe('phishing');
    expect(disableReasonFor({ reason: 'other' })).toBe('');
  });
});

describe('validateBlock', () => {
  it('needs a value', () => {
    expect(validateBlock('email', '  ')).toBe('Type what to block.');
  });

  it('checks emails', () => {
    expect(validateBlock('email', 'spammer@example.com')).toBe('');
    expect(validateBlock('email', 'spammer')).toMatch(/email address/);
  });

  it('checks domains, allowing a leading @', () => {
    expect(validateBlock('email_domain', 'example.com')).toBe('');
    expect(validateBlock('email_domain', '@Example.COM')).toBe('');
    expect(validateBlock('email_domain', 'example')).toMatch(/Just the domain/);
  });

  it('checks IPv4 and IPv6 addresses', () => {
    expect(validateBlock('ip', '203.0.113.7')).toBe('');
    expect(validateBlock('ip', '2001:db8::1')).toBe('');
    expect(validateBlock('ip', 'not-an-ip')).toMatch(/IP address/);
  });

  it('has a placeholder for every block type', () => {
    expect(blockTypes.map((t) => t.value)).toEqual(['email', 'email_domain', 'ip']);
    expect(blockTypes.every((t) => t.placeholder)).toBe(true);
  });
});

describe('validateSuspension', () => {
  it('needs a user id', () => {
    expect(validateSuspension(' ', 'spam')).toBe('Paste the user id.');
    expect(validateSuspension('', null)).toBe('Paste the user id.');
  });

  it('needs a reason to suspend, but not to lift', () => {
    expect(validateSuspension('u1', ' ')).toMatch(/Give a reason/);
    expect(validateSuspension('u1', 'phishing')).toBe('');
    expect(validateSuspension('u1', null)).toBe('');
  });
});
