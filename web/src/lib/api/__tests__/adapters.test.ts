import { describe, expect, it } from 'vitest';
import type { ChannelDto, FormDto, SubmissionDto } from '@sendm8/shared';
import {
  buildFormPatch,
  challengeFor,
  clipText,
  countryName,
  describeUserAgent,
  endpointBase,
  fieldNamesFrom,
  fieldText,
  fileSize,
  referrerLabel,
  spamReasonLabel,
  toChannel,
  toDelivery,
  toForm,
  toSubmission,
  trackingNo,
  turnstileMode,
  type SettingsDraft,
} from '../adapters';

function formDto(over: Partial<FormDto> = {}): FormDto {
  return {
    id: 'k3x9q2m7ab',
    name: 'Studio contact',
    status: 'active',
    endpoint: 'https://sendm8.com/f/k3x9q2m7ab',
    allowedOrigins: ['example.com'],
    redirectUrl: null,
    settings: {},
    flaggedReason: null,
    turnstileConfigured: false,
    emailEndpoint: null,
    createdAt: 1_700_000_000_000,
    submissionsThisMonth: 12,
    monthlyLimit: 1000,
    lastSubmissionAt: 1_700_000_500_000,
    ...over,
  };
}

function submissionDto(over: Partial<SubmissionDto> = {}): SubmissionDto {
  return {
    id: '01j8zzzzzz7q2k9f4x3m',
    formId: 'k3x9q2m7ab',
    data: { name: 'Marta', email: 'marta@example.com', tags: ['a', 'b'] },
    status: 'ok',
    spamScore: 0.04,
    starred: false,
    createdAt: 1_700_000_000_000,
    country: 'GB',
    referrer: 'https://www.example.com/contact',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    special: {},
    spamReasons: [],
    droppedFiles: [],
    files: [],
    deliveries: [],
    retryAt: null,
    ...over,
  };
}

const channelDto = (over: Partial<ChannelDto> = {}): ChannelDto => ({
  id: 'ch1',
  formId: 'k3x9q2m7ab',
  type: 'discord',
  label: 'Discord · leads',
  enabled: true,
  createdAt: 1,
  lastTest: null,
  ...over,
});

describe('formatters', () => {
  it('trackingNo uses the last ten characters, upper-cased', () => {
    expect(trackingNo('01j8zzzzzz7q2k9f4x3m')).toBe('SM8 7Q2K 9F4X 3M');
  });

  it('fieldText joins multi-value fields', () => {
    expect(fieldText(['a', 'b'])).toBe('a, b');
    expect(fieldText('x')).toBe('x');
    expect(fieldText(undefined)).toBe('');
  });

  it('countryName resolves region codes and tolerates junk', () => {
    expect(countryName('GB')).toBe('United Kingdom');
    expect(countryName(null)).toBeNull();
    expect(countryName('not-a-code')).toBe('not-a-code');
  });

  it('describeUserAgent names common browsers and systems', () => {
    expect(describeUserAgent(submissionDto().userAgent)).toBe('Chrome 139 · Windows');
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15')).toBe('Safari 19 · macOS');
    expect(describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0')).toBe('Firefox 142 · Linux');
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari 18 · iPhone');
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/139.0 Mobile Safari/537.36 Edg/139.0')).toBe('Edge 139 · Android');
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 OPR/105.0')).toBe('Opera 105 · Windows');
    expect(describeUserAgent('curl/8.4.0')).toBe('curl');
    expect(describeUserAgent('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)')).toBe('ChromeOS');
    expect(describeUserAgent('SomeBot')).toBe('SomeBot');
    expect(describeUserAgent('x'.repeat(80))).toHaveLength(58);
    expect(describeUserAgent(null)).toBeNull();
  });

  it('referrerLabel drops protocol and www', () => {
    expect(referrerLabel('https://www.example.com/contact')).toBe('example.com/contact');
    expect(referrerLabel('https://example.com/')).toBe('example.com');
    expect(referrerLabel('not a url')).toBe('not a url');
    expect(referrerLabel(null)).toBeNull();
  });

  it('spamReasonLabel explains AI scores', () => {
    expect(spamReasonLabel('ai:97')).toBe('AI double-check: 97% sure it’s spam');
    expect(spamReasonLabel('ai')).toBe('AI double-check thought it looked like spam');
    expect(spamReasonLabel('Honeypot filled')).toBe('Honeypot filled');
  });

  it('spamReasonLabel explains the heuristics codes', () => {
    expect(spamReasonLabel('links:3')).toBe('3 links in one message');
    expect(spamReasonLabel('links')).toBe('Lots of links in one message');
    expect(spamReasonLabel('phrases:1')).toBe('A known spam phrase');
    expect(spamReasonLabel('phrases:2')).toBe('2 known spam phrases');
    expect(spamReasonLabel('markup_links')).toMatch(/HTML or BBCode/);
    expect(spamReasonLabel('url_only_message')).toBe('The message is just a link');
    expect(spamReasonLabel('honeypot')).toMatch(/honeypot/);
    expect(spamReasonLabel('sensitive_field:card_number')).toMatch(/“card_number”/);
    expect(spamReasonLabel('sensitive_field')).toMatch(/card details$/);
    expect(spamReasonLabel('form_flagged')).toMatch(/flagged/);
  });

  it('clipText flattens and shortens long destination errors', () => {
    expect(clipText('  405\n <html>  ')).toBe('405 <html>');
    expect(clipText('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(clipText(undefined)).toBe('');
  });

  it('fileSize picks a sensible unit', () => {
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(412 * 1024)).toBe('412 KB');
    expect(fileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('endpointBase strips the protocol and id', () => {
    expect(endpointBase('https://sendm8.com/f/k3x9q2m7ab', 'k3x9q2m7ab')).toBe('sendm8.com/f/');
    expect(endpointBase('http://localhost:8787/f/other', 'k3x9q2m7ab')).toBe('localhost:8787/f/');
  });
});

describe('forms', () => {
  it('maps a FormDto into the view model', () => {
    const f = toForm(
      formDto({ settings: { notifyMode: 'digest', honeypotField: 'website', challenge: 'always', aiSpamScoring: true }, flaggedReason: 'phishing' }),
      [
        { day: '2026-09-13', submissions: 2 },
        { day: '2026-09-14', submissions: 5 },
      ],
    );
    expect(f).toMatchObject({
      endpointBase: 'sendm8.com/f/',
      notify: 'digest',
      honeypotField: 'website',
      challenge: 'always',
      turnstile: 'always',
      aiSpamScoring: true,
      daily: [2, 5],
      monthCount: 12,
      lastReceivedAt: 1_700_000_500_000,
      flag: 'phishing',
      strictOrigin: true,
    });
  });

  it('uses defaults for empty settings and accepts plain number stats', () => {
    const f = toForm(formDto(), [1, 2, 3]);
    expect(f).toMatchObject({ notify: 'instant', honeypotField: '', challenge: 'suspicious', turnstile: 'challenge', aiSpamScoring: false, daily: [1, 2, 3] });
    expect(toForm(formDto()).daily).toEqual([]);
  });

  it('turnstileMode prefers the form’s own secret', () => {
    expect(turnstileMode({ turnstileConfigured: true, settings: { challenge: 'off' } })).toBe('byo');
    expect(turnstileMode({ turnstileConfigured: false, settings: { challenge: 'off' } })).toBe('off');
    expect(turnstileMode({ turnstileConfigured: false, settings: {} })).toBe('challenge');
    expect(challengeFor('challenge')).toBe('suspicious');
    expect(challengeFor('always')).toBe('always');
  });
});

describe('buildFormPatch', () => {
  const form = toForm(formDto({ settings: { honeypotField: 'website' } }));
  const draftOf = (over: Partial<SettingsDraft> = {}): SettingsDraft => ({
    name: form.name,
    redirectUrl: '',
    allowedOrigins: [...form.allowedOrigins],
    notify: form.notify,
    honeypotField: form.honeypotField,
    turnstile: form.turnstile,
    turnstileSecret: '',
    aiSpamScoring: form.aiSpamScoring,
    ...over,
  });

  it('returns nothing when nothing changed', () => {
    expect(buildFormPatch(form, draftOf())).toEqual({ patch: null, turnstile: null });
  });

  it('sends only what changed, with settings grouped', () => {
    const { patch, turnstile } = buildFormPatch(
      form,
      draftOf({ name: '  New name ', redirectUrl: 'https://example.com/thanks', allowedOrigins: ['example.com', 'b.com'], notify: 'off', honeypotField: 'url', aiSpamScoring: true, turnstile: 'always' }),
    );
    expect(patch).toEqual({
      name: 'New name',
      redirectUrl: 'https://example.com/thanks',
      allowedOrigins: ['example.com', 'b.com'],
      settings: { notifyMode: 'off', honeypotField: 'url', aiSpamScoring: true, challenge: 'always' },
    });
    expect(turnstile).toBeNull();
  });

  it('clears a redirect with null', () => {
    const withRedirect = { ...form, redirectUrl: 'https://example.com/a' };
    expect(buildFormPatch(withRedirect, draftOf({ redirectUrl: '  ' })).patch).toEqual({ redirectUrl: null });
  });

  it('puts a new Turnstile secret for bring-your-own', () => {
    expect(buildFormPatch(form, draftOf({ turnstile: 'byo', turnstileSecret: ' 0xabc ' }))).toEqual({ patch: null, turnstile: { action: 'put', secretKey: '0xabc' } });
    expect(buildFormPatch(form, draftOf({ turnstile: 'byo' })).turnstile).toBeNull();
  });

  it('deletes a stored secret when switching away from bring-your-own', () => {
    const byo = toForm(formDto({ turnstileConfigured: true, settings: { challenge: 'suspicious', honeypotField: 'website' } }));
    expect(buildFormPatch(byo, { ...draftOf(), turnstile: 'off' })).toEqual({ patch: { settings: { challenge: 'off' } }, turnstile: { action: 'delete' } });
  });
});

describe('channels & submissions', () => {
  const channels = [toChannel(channelDto()), toChannel(channelDto({ id: 'ch2', type: 'email', label: 'me@example.com', recipientVerified: false }))];

  it('toChannel keeps recipientVerified only for email', () => {
    expect(channels[0]).not.toHaveProperty('recipientVerified');
    expect(channels[1].recipientVerified).toBe(false);
  });

  it('maps delivery states and resolves channel names', () => {
    expect(toDelivery({ channelId: 'ch1', status: 'sent', attempts: 1, at: 5 }, channels)).toEqual({
      channelId: 'ch1',
      type: 'discord',
      label: 'Discord · leads',
      status: 'delivered',
      viaDigest: false,
      attempts: 1,
      at: 5,
    });
    expect(toDelivery({ channelId: 'ch2', status: 'sent', attempts: 1, at: 5, viaDigest: true }, channels)).toMatchObject({ status: 'delivered', viaDigest: true, type: 'email' });
    expect(toDelivery({ channelId: 'ch1', status: 'failed', attempts: 2, at: 5, error: '429' }, channels)).toMatchObject({ status: 'retrying', error: '429' });
    expect(toDelivery({ channelId: 'ch1', status: 'digest', attempts: 0, at: 5 }, channels).status).toBe('digest');
    expect(toDelivery({ channelId: 'gone', status: 'skipped', attempts: 5, at: 5, error: 'unverified' }, channels)).toMatchObject({
      status: 'failed',
      type: null,
      label: 'Removed channel',
      error: 'unverified',
    });
  });

  it('maps a SubmissionDto', () => {
    const s = toSubmission(
      submissionDto({
        deliveries: [{ channelId: 'ch1', status: 'sent', attempts: 1, at: 9 }],
        files: [{ id: 'f1', field: 'cv', name: 'cv.pdf', size: 1000, type: 'application/pdf', url: '/api/submissions/x/files/f1' }],
      }),
      channels,
      true,
    );
    expect(s).toMatchObject({
      tracking: 'SM8 7Q2K 9F4X 3M',
      data: { name: 'Marta', email: 'marta@example.com', tags: 'a, b' },
      raw: { tags: ['a', 'b'] },
      read: true,
      meta: { country: 'GB', countryName: 'United Kingdom', browser: 'Chrome 139 · Windows', referrer: 'example.com/contact' },
    });
    expect(s.deliveries[0].label).toBe('Discord · leads');
    expect(s.files[0].url).toBe('/api/submissions/x/files/f1');
  });

  it('tolerates missing optional arrays', () => {
    const partial = { ...submissionDto(), special: undefined, files: undefined, droppedFiles: undefined, spamReasons: undefined, deliveries: undefined } as unknown as SubmissionDto;
    const s = toSubmission(partial, []);
    expect(s).toMatchObject({ special: {}, files: [], droppedFiles: [], spamReasons: [], deliveries: [], read: false });
  });

  it('fieldNamesFrom collects names in order, skipping underscore fields', () => {
    expect(fieldNamesFrom([{ data: { email: 'a', _subject: 'x' } }, { data: { name: 'b', email: 'c' } }])).toEqual(['email', 'name']);
  });
});
