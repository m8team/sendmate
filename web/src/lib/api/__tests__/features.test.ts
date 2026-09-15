import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESEND_COOLDOWN_MS,
  buildFormPatch,
  countdown,
  deliveryErrorLabel,
  formatBytes,
  joinFrom,
  percent,
  resendCooldownLeft,
  splitFrom,
  toChannel,
  toForm,
  toSubmission,
  type SettingsDraft,
} from '../adapters';
import { friendlyError } from '../errors';
import { ApiRequestError } from '../client';
import { invalidate, loadIsAdmin, loadLimits } from '../store';
import type { FormDto, SubmissionDto } from '@sendm8/shared';
import { json, mockFetch } from './helpers';

const formDto = (over: Partial<FormDto> = {}): FormDto => ({
  id: 'k3x9q2m7ab',
  name: 'Studio contact',
  status: 'active',
  endpoint: 'https://sendm8.com/f/k3x9q2m7ab',
  allowedOrigins: [],
  redirectUrl: null,
  settings: {},
  flaggedReason: null,
  turnstileConfigured: false,
  emailEndpoint: null,
  createdAt: 1,
  submissionsThisMonth: 0,
  monthlyLimit: 1000,
  lastSubmissionAt: null,
  ...over,
});

const submissionDto = (over: Partial<SubmissionDto> = {}): SubmissionDto => ({
  id: '01j8zzzzzz7q2k9f4x3m',
  formId: 'k3x9q2m7ab',
  data: {},
  status: 'ok',
  spamScore: 0,
  starred: false,
  createdAt: 1,
  country: null,
  referrer: null,
  userAgent: null,
  special: {},
  spamReasons: [],
  droppedFiles: [],
  files: [],
  deliveries: [],
  retryAt: null,
  ...over,
});

beforeEach(() => invalidate());

describe('new DTO fields', () => {
  it('keeps folder counts from GET /api/forms/:id, and null from the list', () => {
    const counts = { inbox: 4, spam: 2, held: 1, starred: 0, total: 7 };
    expect(toForm(formDto({ counts })).counts).toEqual(counts);
    expect(toForm(formDto()).counts).toBeNull();
  });

  it('carries retryAt and saved channel tests', () => {
    expect(toSubmission(submissionDto({ retryAt: 123 }), []).retryAt).toBe(123);
    expect(toSubmission({ ...submissionDto(), retryAt: undefined } as never, []).retryAt).toBeNull();
    const lastTest = { at: 5, ok: false, message: '404 Unknown Webhook' };
    expect(toChannel({ id: 'c', formId: 'f', type: 'discord', label: 'x', enabled: true, createdAt: 1, lastTest }).lastTest).toEqual(lastTest);
    expect(toChannel({ id: 'c', formId: 'f', type: 'discord', label: 'x', enabled: true, createdAt: 1 } as never).lastTest).toBeNull();
  });

  it('clears a custom honeypot with null', () => {
    const form = toForm(formDto({ settings: { honeypotField: 'website' } }));
    const draft: SettingsDraft = {
      name: form.name,
      redirectUrl: '',
      allowedOrigins: [...form.allowedOrigins],
      notify: form.notify,
      honeypotField: '',
      turnstile: form.turnstile,
      turnstileSecret: '',
      aiSpamScoring: false,
    };
    expect(buildFormPatch(form, draft).patch).toEqual({ settings: { honeypotField: null } });
    // Nothing to clear when there was no custom honeypot.
    expect(buildFormPatch(toForm(formDto()), draft).patch).toBeNull();
  });
});

describe('email address helpers', () => {
  const now = 1_000_000;
  it('works out the resend cooldown', () => {
    expect(resendCooldownLeft({ verified: false, verificationSentAt: now - 60_000 }, now)).toBe(RESEND_COOLDOWN_MS - 60_000);
    expect(resendCooldownLeft({ verified: false, verificationSentAt: now - RESEND_COOLDOWN_MS - 1 }, now)).toBe(0);
    expect(resendCooldownLeft({ verified: false, verificationSentAt: null }, now)).toBe(0);
    expect(resendCooldownLeft({ verified: true, verificationSentAt: now }, now)).toBe(0);
  });

  it('formats a countdown', () => {
    expect(countdown(9 * 60_000 + 5_000)).toBe('9:05');
    expect(countdown(400)).toBe('0:01');
    expect(countdown(-5)).toBe('0:00');
  });

  it('splits and joins from addresses', () => {
    expect(splitFrom('Dev Mate <Forms@Example.com>')).toEqual({ name: 'Dev Mate', local: 'Forms', domain: 'example.com' });
    expect(splitFrom('"Studio" <hi@studio.dev>')).toEqual({ name: 'Studio', local: 'hi', domain: 'studio.dev' });
    expect(splitFrom('hello@example.com')).toEqual({ name: '', local: 'hello', domain: 'example.com' });
    expect(splitFrom('nonsense')).toEqual({ name: '', local: 'nonsense', domain: '' });
    expect(splitFrom(null)).toEqual({ name: '', local: '', domain: '' });
    expect(joinFrom({ name: ' Dev <Mate> ', local: ' forms ', domain: 'example.com' })).toBe('Dev Mate <forms@example.com>');
    expect(joinFrom({ name: '', local: 'forms', domain: 'example.com' })).toBe('forms@example.com');
  });
});

describe('delivery errors', () => {
  it('explains Worker codes and keeps destination messages', () => {
    expect(deliveryErrorLabel('recipient_removed')).toMatch(/removed/);
    expect(deliveryErrorLabel('405 Method Not Allowed')).toBe('405 Method Not Allowed');
    expect(deliveryErrorLabel(undefined)).toBeUndefined();
  });
});

describe('admin helpers', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(formatBytes(9 * 1024 ** 3)).toBe('9.0 GB');
    expect(formatBytes(3 * 1024 ** 5)).toBe('3072 TB');
  });

  it('percent caps at 100 and survives a zero limit', () => {
    expect(percent(50, 200)).toBe(25);
    expect(percent(500, 200)).toBe(100);
    expect(percent(5, 0)).toBe(0);
  });

  it('maps the new error codes', () => {
    expect(friendlyError(new ApiRequestError(409, 'nothing_to_retry', 'x'))).toMatch(/Nothing to retry/);
    expect(friendlyError(new ApiRequestError(404, 'resend_not_configured', 'x'))).toMatch(/Resend API key/);
  });
});

describe('store: limits and admin probe', () => {
  it('reads limits from /api/me', async () => {
    mockFetch(() => json({ data: { user: {}, limits: { spamRetentionDays: 14 } } }));
    await expect(loadLimits()).resolves.toEqual({ spamRetentionDays: 14 });
  });

  function stubSession() {
    const map = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) });
    return map;
  }

  it('is an admin when usage answers 200, and remembers it', async () => {
    const map = stubSession();
    const { calls } = mockFetch(() => json({ data: { day: '2026-09-15' } }));
    await expect(loadIsAdmin('u1')).resolves.toBe(true);
    expect(map.get('sendm8-admin-v1:u1')).toBe('1');
    invalidate();
    await expect(loadIsAdmin('u1')).resolves.toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('is not an admin on 404, and remembers that too', async () => {
    const map = stubSession();
    mockFetch(() => json({ error: { code: 'not_found', message: 'No such endpoint.' } }, 404));
    await expect(loadIsAdmin('u2')).resolves.toBe(false);
    expect(map.get('sendm8-admin-v1:u2')).toBe('0');
    invalidate();
    const { calls } = mockFetch();
    await expect(loadIsAdmin('u2')).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('does not remember other failures, and copes without sessionStorage', async () => {
    const map = stubSession();
    mockFetch(() => json({ error: { code: 'x', message: 'down' } }, 500));
    await expect(loadIsAdmin('u3')).resolves.toBe(false);
    expect(map.has('sendm8-admin-v1:u3')).toBe(false);

    invalidate();
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
    });
    mockFetch(() => json({ data: {} }));
    await expect(loadIsAdmin('u4')).resolves.toBe(true);

    invalidate();
    vi.stubGlobal('sessionStorage', undefined);
    await expect(loadIsAdmin('u5')).resolves.toBe(true);
  });
});
