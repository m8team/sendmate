import { describe, expect, it } from 'vitest';
import { checkFrom, checkKeyFormat, checkLocalPart, checkNewAddress, isAccountAddress, keyChecks } from './resendRules';

describe('checkKeyFormat', () => {
  it('accepts a Resend-shaped key', () => {
    expect(checkKeyFormat('re_12345678_abcDEF-9')).toBe('');
  });

  it('explains what is wrong with a bad key', () => {
    expect(checkKeyFormat('')).toMatch(/Paste your key first/);
    expect(checkKeyFormat('re_1234 5678')).toMatch(/space in there/);
    expect(checkKeyFormat('sk_12345678')).toMatch(/start with re_/);
    expect(checkKeyFormat('re_1234')).toMatch(/too short/);
    expect(checkKeyFormat('re_1234567$')).toMatch(/characters Resend keys don’t use/);
  });
});

describe('checkFrom', () => {
  it('accepts a bare address or a named one', () => {
    expect(checkFrom('forms@example.com')).toBe('');
    expect(checkFrom('Jo Bloggs <forms@example.com>')).toBe('');
  });

  it('needs an address', () => {
    expect(checkFrom('')).toMatch(/Which address should notifications come from/);
  });

  it('rejects malformed addresses', () => {
    expect(checkFrom('Jo Bloggs')).toMatch(/Use an address like/);
    expect(checkFrom('forms@example')).toMatch(/Use an address like/);
    expect(checkFrom('Jo <forms@example.com')).toMatch(/Use an address like/);
    expect(checkFrom('<>')).toMatch(/Use an address like/);
  });
});

describe('checkLocalPart', () => {
  it('accepts letters, numbers, dots, dashes and plus signs', () => {
    expect(checkLocalPart('forms')).toBe('');
    expect(checkLocalPart(' hello.world+forms-1 ')).toBe('');
  });

  it('rejects empty, symbol-first or overlong local parts', () => {
    expect(checkLocalPart('')).toMatch(/before the @/);
    expect(checkLocalPart('.forms')).toMatch(/before the @/);
    expect(checkLocalPart('for ms')).toMatch(/before the @/);
    expect(checkLocalPart('a'.repeat(65))).toMatch(/before the @/);
  });
});

describe('checkNewAddress', () => {
  it('needs a plausible email', () => {
    expect(checkNewAddress('')).toMatch(/Type the address/);
    expect(checkNewAddress('hello@')).toMatch(/doesn’t look quite right/);
    expect(checkNewAddress('hello@example.com')).toBe('');
  });
});

describe('isAccountAddress', () => {
  it('matches the sign-in email, ignoring case', () => {
    expect(isAccountAddress({ email: 'Jo@Example.com' }, 'jo@example.com')).toBe(true);
    expect(isAccountAddress({ email: 'other@example.com' }, 'jo@example.com')).toBe(false);
  });

  it('is false before the account has loaded', () => {
    expect(isAccountAddress({ email: 'jo@example.com' }, undefined)).toBe(false);
  });
});

describe('keyChecks', () => {
  it('lists the three checks in order', () => {
    expect(keyChecks.map((c) => c.n)).toEqual([1, 2, 3]);
  });
});
