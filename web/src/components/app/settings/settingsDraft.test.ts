import { describe, expect, it } from 'vitest';
import type { Form } from '../../../lib/api/types';
import { domainError, draftFromForm, errorKeyForApiField, errorKeys, errorTab, validateHoneypot, validateName, validateTurnstileSecret } from './settingsDraft';

const form = {
  name: 'Contact',
  redirectUrl: null,
  allowedOrigins: ['example.com'],
  notify: 'digest',
  honeypotField: 'website_url',
  turnstile: 'byo',
  turnstileConfigured: true,
  aiSpamScoring: true,
} as Form;

describe('draftFromForm', () => {
  it('copies the editable settings, with an empty secret and redirect', () => {
    expect(draftFromForm(form)).toEqual({
      name: 'Contact',
      redirectUrl: '',
      allowedOrigins: ['example.com'],
      notify: 'digest',
      honeypotField: 'website_url',
      turnstile: 'byo',
      turnstileSecret: '',
      aiSpamScoring: true,
    });
  });

  it('copies the domain list so editing the draft leaves the form alone', () => {
    const draft = draftFromForm(form);
    draft.allowedOrigins.push('other.com');
    expect(form.allowedOrigins).toEqual(['example.com']);
  });
});

describe('validateName', () => {
  it('needs a name', () => {
    expect(validateName('')).toMatch(/needs a name/);
    expect(validateName('   ')).toMatch(/needs a name/);
  });

  it('caps it at 100 characters, ignoring surrounding spaces', () => {
    expect(validateName('a'.repeat(100))).toBeUndefined();
    expect(validateName(` ${'a'.repeat(100)} `)).toBeUndefined();
    expect(validateName('a'.repeat(101))).toMatch(/under 100/);
  });
});

describe('validateHoneypot', () => {
  it('allows an empty field (the built-ins still work)', () => {
    expect(validateHoneypot('')).toBeUndefined();
    expect(validateHoneypot('  ')).toBeUndefined();
  });

  it('accepts names that start with a letter', () => {
    expect(validateHoneypot('website_url')).toBeUndefined();
    expect(validateHoneypot('a-b_9')).toBeUndefined();
  });

  it('rejects names starting with a symbol or number, or with spaces', () => {
    expect(validateHoneypot('_gotcha')).toMatch(/Start with a letter/);
    expect(validateHoneypot('9lives')).toMatch(/Start with a letter/);
    expect(validateHoneypot('my field')).toMatch(/Start with a letter/);
  });
});

describe('validateTurnstileSecret', () => {
  const secret = '0x4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  it('only checks in bring-your-own mode', () => {
    expect(validateTurnstileSecret('off', '', false)).toBeUndefined();
    expect(validateTurnstileSecret('challenge', 'nonsense', false)).toBeUndefined();
  });

  it('needs a secret unless one is already stored', () => {
    expect(validateTurnstileSecret('byo', '', false)).toMatch(/Paste your Turnstile secret/);
    expect(validateTurnstileSecret('byo', '', true)).toBeUndefined();
  });

  it('checks the shape of a pasted secret', () => {
    expect(validateTurnstileSecret('byo', secret, false)).toBeUndefined();
    expect(validateTurnstileSecret('byo', ` ${secret} `, true)).toBeUndefined();
    expect(validateTurnstileSecret('byo', '1x0000000000000000000000AA', true)).toMatch(/start with 0x/);
    expect(validateTurnstileSecret('byo', '0xshort', false)).toMatch(/start with 0x/);
  });
});

describe('domainError', () => {
  it('needs a domain', () => {
    expect(domainError('', [])).toMatch(/Type a domain/);
  });

  it('rejects things that are not hostnames', () => {
    expect(domainError('not a domain', [])).toMatch(/doesn’t look like a domain/);
    expect(domainError('localhost', [])).toMatch(/doesn’t look like a domain/);
  });

  it('accepts hostnames and wildcard subdomains', () => {
    expect(domainError('example.com', [])).toBeUndefined();
    expect(domainError('*.example.com', [])).toBeUndefined();
  });

  it('rejects duplicates', () => {
    expect(domainError('example.com', ['example.com'])).toBe('example.com is already on the list.');
  });

  it('stops at ten domains', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `site${i}.com`);
    expect(domainError('eleven.com', ten)).toMatch(/ten already/);
    expect(domainError('ten.com', ten.slice(1))).toBeUndefined();
  });
});

describe('errorKeyForApiField', () => {
  it('maps API fields to settings inputs', () => {
    expect(errorKeyForApiField('name')).toBe('name');
    expect(errorKeyForApiField('redirectUrl')).toBe('redirect');
    expect(errorKeyForApiField('allowedOrigins')).toBe('domain');
    expect(errorKeyForApiField('allowedOrigins[2]')).toBe('domain');
    expect(errorKeyForApiField('settings.honeypotField')).toBe('honeypot');
    expect(errorKeyForApiField('secretKey')).toBe('secret');
  });

  it('returns null for missing or unknown fields', () => {
    expect(errorKeyForApiField(null)).toBeNull();
    expect(errorKeyForApiField('')).toBeNull();
    expect(errorKeyForApiField('status')).toBeNull();
  });
});

describe('errorTab', () => {
  it('puts every error key on a tab', () => {
    expect(errorKeys).toEqual(['name', 'redirect', 'domain', 'honeypot', 'secret']);
    expect(errorKeys.map((k) => errorTab[k])).toEqual(['general', 'general', 'general', 'spam', 'spam']);
  });
});
