import { describe, expect, it } from 'vitest';
import { BULK_MAX, api, bulkAll } from '../endpoints';
import { json, mockFetch } from './helpers';

type Case = [name: string, run: () => Promise<unknown>, method: string, url: string, body?: unknown];

const cases: Case[] = [
  ['me', () => api.me(), 'GET', '/api/me'],
  ['devLogin', () => api.devLogin(), 'POST', '/api/dev/login', { email: 'dev@sendm8.local' }],
  ['listForms', () => api.listForms(), 'GET', '/api/forms'],
  ['getForm', () => api.getForm('abc1234567'), 'GET', '/api/forms/abc1234567'],
  ['createForm', () => api.createForm({ name: 'Contact' }), 'POST', '/api/forms', { name: 'Contact' }],
  ['updateForm', () => api.updateForm('abc1234567', { status: 'paused' }), 'PATCH', '/api/forms/abc1234567', { status: 'paused' }],
  ['deleteForm', () => api.deleteForm('abc1234567'), 'DELETE', '/api/forms/abc1234567'],
  ['stats', () => api.stats('abc1234567'), 'GET', '/api/forms/abc1234567/stats?days=30'],
  ['setTurnstile', () => api.setTurnstile('abc1234567', '0xsecret'), 'PUT', '/api/forms/abc1234567/turnstile', { secretKey: '0xsecret' }],
  ['deleteTurnstile', () => api.deleteTurnstile('abc1234567'), 'DELETE', '/api/forms/abc1234567/turnstile'],
  [
    'listSubmissions',
    () => api.listSubmissions('abc1234567', { filter: 'spam', q: ' hi ', cursor: 'c9', limit: 20 }),
    'GET',
    '/api/forms/abc1234567/submissions?filter=spam&q=hi&cursor=c9&limit=20',
  ],
  ['listSubmissions defaults', () => api.listSubmissions('abc1234567'), 'GET', '/api/forms/abc1234567/submissions'],
  ['getSubmission', () => api.getSubmission('01h'), 'GET', '/api/submissions/01h'],
  ['updateSubmission', () => api.updateSubmission('01h', { starred: true }), 'PATCH', '/api/submissions/01h', { starred: true }],
  ['deleteSubmission', () => api.deleteSubmission('01h'), 'DELETE', '/api/submissions/01h'],
  ['bulk', () => api.bulk('abc1234567', ['a', 'b'], 'spam'), 'POST', '/api/forms/abc1234567/submissions/bulk', { ids: ['a', 'b'], action: 'spam' }],
  ['listChannels', () => api.listChannels('abc1234567'), 'GET', '/api/forms/abc1234567/channels'],
  [
    'createChannel',
    () => api.createChannel('abc1234567', { type: 'telegram', botToken: 't', chatId: '1' }),
    'POST',
    '/api/forms/abc1234567/channels',
    { type: 'telegram', botToken: 't', chatId: '1' },
  ],
  ['updateChannel', () => api.updateChannel('ch1', { enabled: false }), 'PATCH', '/api/channels/ch1', { enabled: false }],
  ['renameChannel', () => api.updateChannel('ch1', { label: 'Leads' }), 'PATCH', '/api/channels/ch1', { label: 'Leads' }],
  [
    'createChannel with label',
    () => api.createChannel('abc1234567', { type: 'webhook', url: 'https://x.com' }, ' Zapier '),
    'POST',
    '/api/forms/abc1234567/channels',
    { type: 'webhook', url: 'https://x.com', label: 'Zapier' },
  ],
  ['createChannel blank label', () => api.createChannel('abc1234567', { type: 'slack', webhookUrl: 'u' }, '  '), 'POST', '/api/forms/abc1234567/channels', { type: 'slack', webhookUrl: 'u' }],
  ['retrySubmission', () => api.retrySubmission('01h'), 'POST', '/api/submissions/01h/retry'],
  ['patchResendFrom', () => api.patchResendFrom(' Me <me@x.com> '), 'PATCH', '/api/settings/resend', { from: 'Me <me@x.com>' }],
  ['resendDomains', () => api.resendDomains(), 'GET', '/api/settings/resend/domains'],
  ['adminReports', () => api.adminReports(), 'GET', '/api/admin/reports'],
  ['adminReports all', () => api.adminReports('all'), 'GET', '/api/admin/reports?status=all'],
  ['resolveReport', () => api.resolveReport('r1'), 'POST', '/api/admin/reports/r1/resolve'],
  ['disableForm', () => api.disableForm('f1', ' phishing '), 'POST', '/api/admin/forms/f1/disable', { reason: 'phishing' }],
  ['restoreForm', () => api.restoreForm('f1'), 'POST', '/api/admin/forms/f1/restore'],
  ['suspendUser', () => api.suspendUser(' u1 ', 'spam'), 'POST', '/api/admin/users/u1/suspend', { reason: 'spam' }],
  ['unsuspendUser', () => api.unsuspendUser('u1'), 'POST', '/api/admin/users/u1/unsuspend'],
  ['blocklist', () => api.blocklist(), 'GET', '/api/admin/blocklist'],
  ['addBlock', () => api.addBlock({ type: 'email_domain', value: ' spam.biz ', reason: ' bots ' }), 'POST', '/api/admin/blocklist', { type: 'email_domain', value: 'spam.biz', reason: 'bots' }],
  ['addBlock without reason', () => api.addBlock({ type: 'ip', value: '1.2.3.4', reason: ' ' }), 'POST', '/api/admin/blocklist', { type: 'ip', value: '1.2.3.4' }],
  ['removeBlock', () => api.removeBlock({ type: 'email', value: 'a@b.com' }), 'DELETE', '/api/admin/blocklist', { type: 'email', value: 'a@b.com' }],
  ['deleteChannel', () => api.deleteChannel('ch1'), 'DELETE', '/api/channels/ch1'],
  ['testChannel', () => api.testChannel('ch1'), 'POST', '/api/channels/ch1/test'],
  ['rotateSecret', () => api.rotateSecret('ch1'), 'POST', '/api/channels/ch1/rotate-secret'],
  ['listEmails', () => api.listEmails(), 'GET', '/api/emails'],
  ['addEmail', () => api.addEmail(' me@example.com '), 'POST', '/api/emails', { email: 'me@example.com' }],
  ['resendEmail', () => api.resendEmail('e1'), 'POST', '/api/emails/e1/resend'],
  ['deleteEmail', () => api.deleteEmail('e1'), 'DELETE', '/api/emails/e1'],
  ['emailSettings', () => api.emailSettings(), 'GET', '/api/settings/email'],
  ['putResend', () => api.putResend(' re_key ', ' Me <me@x.com> '), 'PUT', '/api/settings/resend', { apiKey: 're_key', from: 'Me <me@x.com>' }],
  ['deleteResend', () => api.deleteResend(), 'DELETE', '/api/settings/resend'],
  ['adminUsage', () => api.adminUsage(), 'GET', '/api/admin/usage'],
  ['adminErrors', () => api.adminErrors(), 'GET', '/api/admin/errors'],
  ['adminErrors resolved', () => api.adminErrors('resolved'), 'GET', '/api/admin/errors?status=resolved'],
  ['resolveError', () => api.resolveError('e1'), 'POST', '/api/admin/errors/e1/resolve'],
  ['reopenError', () => api.reopenError('e1'), 'POST', '/api/admin/errors/e1/reopen'],
  ['exportPage', () => api.exportPage('abc1234567', 'csv', 'all', 'c2'), 'GET', '/api/forms/abc1234567/export?format=csv&filter=all&cursor=c2'],
];

describe('api endpoints', () => {
  it.each(cases)('%s', async (_name, run, method, url, body) => {
    const { calls } = mockFetch(() => json({ data: {} }));
    await run();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe(method);
    expect(calls[0].url).toBe(url);
    expect(calls[0].body).toEqual(body);
  });

  it('encodes ids in paths', async () => {
    const { calls } = mockFetch(() => json({ data: {} }));
    await api.getForm('a/b?c');
    expect(calls[0].url).toBe('/api/forms/a%2Fb%3Fc');
  });

  it('signInSocial returns the redirect URL', async () => {
    const { calls } = mockFetch(() => json({ url: 'https://github.com/login/oauth', redirect: true }));
    await expect(api.signInSocial('github')).resolves.toEqual({ url: 'https://github.com/login/oauth', redirect: true });
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/auth/sign-in/social', body: { provider: 'github', callbackURL: '/app' } });
  });

  it('hasSession reads Better Auth’s session probe', async () => {
    mockFetch(() => json(null));
    await expect(api.hasSession()).resolves.toBe(false);
    const { calls } = mockFetch(() => json({ session: { id: 's' }, user: {} }));
    await expect(api.hasSession()).resolves.toBe(true);
    expect(calls[0].url).toBe('/api/auth/get-session');
  });

  it('signOut posts an empty object', async () => {
    const { calls } = mockFetch(() => json({ success: true }));
    await expect(api.signOut()).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/auth/sign-out', body: {} });
  });
});

describe('api.submit', () => {
  it('posts JSON to the public endpoint without cookies', async () => {
    const { calls } = mockFetch(() => json({ ok: true, id: '01jtest' }));
    await expect(api.submit('abc1234567', { name: 'Test' })).resolves.toEqual({ ok: true, id: '01jtest' });
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/f/abc1234567', body: { name: 'Test' } });
    expect(calls[0].init.credentials).toBe('omit');
    expect(calls[0].headers.accept).toBe('application/json');
  });

  it('throws the endpoint’s own error', async () => {
    mockFetch(() => json({ ok: false, error: { code: 'form_paused', message: 'This form isn’t accepting submissions right now.' } }, 423));
    await expect(api.submit('abc1234567', {})).rejects.toMatchObject({ status: 423, code: 'form_paused' });
  });

  it('copes with a non-JSON failure', async () => {
    mockFetch(() => new Response('gateway', { status: 502 }));
    await expect(api.submit('abc1234567', {})).rejects.toMatchObject({ status: 502, code: 'http_502' });
  });

  it('maps network failures', async () => {
    mockFetch(() => {
      throw new TypeError('offline');
    });
    await expect(api.submit('abc1234567', {})).rejects.toMatchObject({ code: 'network' });
  });
});

describe('bulkAll', () => {
  it('splits ids into API-sized chunks and sums affected rows', async () => {
    const { calls } = mockFetch((call) => json({ data: { affected: (call.body as { ids: string[] }).ids.length } }));
    const ids = Array.from({ length: BULK_MAX * 2 + 5 }, (_, i) => `id${i}`);
    await expect(bulkAll('abc1234567', ids, 'delete', { keepalive: true })).resolves.toBe(ids.length);
    expect(calls.map((c) => (c.body as { ids: string[] }).ids.length)).toEqual([100, 100, 5]);
    expect(calls.every((c) => c.init.keepalive)).toBe(true);
  });

  it('does nothing for an empty list', async () => {
    const { calls } = mockFetch();
    await expect(bulkAll('abc1234567', [], 'star')).resolves.toBe(0);
    expect(calls).toHaveLength(0);
  });
});
