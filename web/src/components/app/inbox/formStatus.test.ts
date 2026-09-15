import { describe, expect, it } from 'vitest';
import { emailAddressOf, formStatusTag, usagePct } from './formStatus';

describe('formStatusTag', () => {
  it('names every status with a tone', () => {
    expect(formStatusTag('active')).toEqual({ text: 'Active', cls: 'tag-ok' });
    expect(formStatusTag('paused')).toEqual({ text: 'Paused', cls: '' });
    expect(formStatusTag('pending_confirmation')).toEqual({ text: 'Awaiting confirmation', cls: 'tag-warn' });
    expect(formStatusTag('disabled')).toEqual({ text: 'Disabled', cls: 'tag-signal' });
  });
});

describe('usagePct', () => {
  it('rounds and caps at 100', () => {
    expect(usagePct(333, 1000)).toBe(33);
    expect(usagePct(1500, 1000)).toBe(100);
    expect(usagePct(3, 0)).toBe(100);
    expect(usagePct(0, 0)).toBe(0);
  });
});

describe('emailAddressOf', () => {
  it('takes the address from an email endpoint', () => {
    expect(emailAddressOf('https://sendm8.com/f/you@example.com')).toBe('you@example.com');
    expect(emailAddressOf(null)).toBeUndefined();
  });
});
