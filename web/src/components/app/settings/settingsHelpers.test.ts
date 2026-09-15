import { describe, expect, it } from 'vitest';
import { hasReplyToField, honeypotSnippet, pauseDescription, riskyFields, statusLocked, statusTag, subjectSnippet, submissionsLabel, usagePct } from './settingsHelpers';

describe('snippets', () => {
  it('puts the form name in the subject snippet', () => {
    expect(subjectSnippet('Contact')).toBe('<input type="hidden" name="_subject" value="New message from Contact">');
  });

  it('uses the custom honeypot name, falling back to _gotcha', () => {
    expect(honeypotSnippet(' website_url ')).toContain('name="website_url"');
    expect(honeypotSnippet('')).toContain('name="_gotcha"');
    expect(honeypotSnippet('   ')).toContain('name="_gotcha"');
    expect(honeypotSnippet('x')).toContain('tabindex="-1" autocomplete="off"');
  });
});

describe('riskyFields', () => {
  it('finds fields the phishing guard holds', () => {
    expect(riskyFields(['name', 'email', 'password', 'card_number', 'cvv', 'seed phrase', 'pin'])).toEqual(['password', 'card_number', 'cvv', 'seed phrase', 'pin']);
    expect(riskyFields(['Passwd', 'SSN', 'mnemonic'])).toEqual(['Passwd', 'SSN', 'mnemonic']);
  });

  it('leaves ordinary fields alone', () => {
    expect(riskyFields(['name', 'message', 'pinned', 'company'])).toEqual([]);
  });

  it('treats unknown field names as none', () => {
    expect(riskyFields(null)).toEqual([]);
  });
});

describe('hasReplyToField', () => {
  it('spots email or replyto fields', () => {
    expect(hasReplyToField(['name', 'email'])).toBe(true);
    expect(hasReplyToField(['replyto'])).toBe(true);
    expect(hasReplyToField(['name', 'Email'])).toBe(false);
  });

  it('is undefined before field names are known', () => {
    expect(hasReplyToField(null)).toBeUndefined();
  });
});

describe('usagePct', () => {
  it('rounds to a whole percentage', () => {
    expect(usagePct(0, 100)).toBe(0);
    expect(usagePct(1, 3)).toBe(33);
    expect(usagePct(80, 100)).toBe(80);
  });

  it('clamps at 100 and survives a zero cap', () => {
    expect(usagePct(150, 100)).toBe(100);
    expect(usagePct(0, 0)).toBe(0);
    expect(usagePct(5, 0)).toBe(100);
  });
});

describe('submissionsLabel', () => {
  it('is empty until counts load', () => {
    expect(submissionsLabel(undefined)).toBe('');
  });

  it('pluralises and groups thousands', () => {
    expect(submissionsLabel(0)).toBe('0 submissions');
    expect(submissionsLabel(1)).toBe('1 submission');
    expect(submissionsLabel(12345)).toBe('12,345 submissions');
  });
});

describe('form status', () => {
  it('tags each status', () => {
    expect(statusTag('active')).toEqual({ cls: 'tag tag-ok', text: 'Accepting post' });
    expect(statusTag('paused')).toEqual({ cls: 'tag tag-warn', text: 'Paused' });
    expect(statusTag('disabled')).toEqual({ cls: 'tag tag-plain', text: 'Switched off' });
    expect(statusTag('pending_confirmation')).toEqual({ cls: 'tag tag-plain', text: 'Awaiting confirmation' });
  });

  it('locks pending and disabled forms', () => {
    expect(statusLocked('active')).toBe(false);
    expect(statusLocked('paused')).toBe(false);
    expect(statusLocked('disabled')).toBe(true);
    expect(statusLocked('pending_confirmation')).toBe(true);
  });

  it('describes what pausing does', () => {
    expect(pauseDescription('active')).toMatch(/^Stop accepting submissions/);
    expect(pauseDescription('paused')).toMatch(/^Right now new submissions are turned away/);
    expect(pauseDescription('disabled')).toMatch(/can’t be changed from here/);
  });
});
