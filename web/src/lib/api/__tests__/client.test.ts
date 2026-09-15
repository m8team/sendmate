import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, apiFetch, buildUrl, isApiError, request, requestPage, setUnauthorizedHandler } from '../client';
import { json, mockFetch } from './helpers';

afterEach(() => setUnauthorizedHandler(null));

describe('buildUrl', () => {
  it('returns the path untouched without a query', () => {
    expect(buildUrl('/api/forms')).toBe('/api/forms');
  });

  it('skips empty values and encodes the rest', () => {
    expect(buildUrl('/api/x', { filter: 'inbox', q: 'a b&c', cursor: null, limit: 50, empty: '', none: undefined, flag: false })).toBe(
      '/api/x?filter=inbox&q=a+b%26c&limit=50&flag=false',
    );
  });

  it('appends to an existing query string', () => {
    expect(buildUrl('/api/x?a=1', { b: 2 })).toBe('/api/x?a=1&b=2');
  });

  it('leaves the path alone when every value is empty', () => {
    expect(buildUrl('/api/x', { q: '' })).toBe('/api/x');
  });
});

describe('request', () => {
  it('unwraps { data } and sends same-origin JSON', async () => {
    const { calls } = mockFetch(() => json({ data: { id: 'abc' } }));
    await expect(request('/api/forms', { method: 'POST', body: { name: 'Hi' } })).resolves.toEqual({ id: 'abc' });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toEqual({ name: 'Hi' });
    expect(calls[0].headers['content-type']).toBe('application/json');
    expect(calls[0].headers.accept).toBe('application/json');
    expect(calls[0].init.credentials).toBe('same-origin');
  });

  it('does not send a body or content-type for GET', async () => {
    const { calls } = mockFetch(() => json({ data: [] }));
    await request('/api/forms');
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].headers['content-type']).toBeUndefined();
  });

  it('passes keepalive through', async () => {
    const { calls } = mockFetch(() => json({ data: null }));
    await request('/api/x', { method: 'POST', keepalive: true });
    expect(calls[0].init.keepalive).toBe(true);
  });

  it('resolves undefined for 204 and empty bodies', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(request('/api/forms/x', { method: 'DELETE' })).resolves.toBeUndefined();
    mockFetch(() => new Response('', { status: 200 }));
    await expect(request('/api/x')).resolves.toBeUndefined();
  });

  it('throws a typed error from an API error body', async () => {
    mockFetch(() => json({ error: { code: 'channel_invalid', message: 'Discord said no.' } }, 422));
    const err = await request('/api/x').catch((e) => e);
    expect(isApiError(err)).toBe(true);
    expect(err).toMatchObject({ status: 422, code: 'channel_invalid', message: 'Discord said no.' });
  });

  it('reads Better Auth’s flat error shape too', async () => {
    mockFetch(() => json({ message: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, 404));
    await expect(request('/api/auth/sign-in/social')).rejects.toMatchObject({ status: 404, code: 'PROVIDER_NOT_FOUND', message: 'Provider not found' });
  });

  it('falls back to a generic error when the body is not JSON', async () => {
    mockFetch(() => new Response('<html>oops</html>', { status: 502 }));
    await expect(request('/api/x')).rejects.toMatchObject({ status: 502, code: 'http_502' });
    mockFetch(() => new Response('nope', { status: 400 }));
    await expect(request('/api/x')).rejects.toMatchObject({ status: 400, code: 'http_400', message: 'That didn’t work. Try again.' });
  });

  it('maps network failures to a network error', async () => {
    mockFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(request('/api/x')).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('rethrows aborts as they are', async () => {
    mockFetch(() => {
      throw new DOMException('Aborted', 'AbortError');
    });
    await expect(request('/api/x')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects a 2xx response that is not JSON', async () => {
    mockFetch(() => new Response('not json', { status: 200 }));
    await expect(request('/api/x')).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('calls the unauthorized handler on 401 only', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(() => json({ error: { code: 'unauthorized', message: 'Sign in to continue.' } }, 401));
    await expect(request('/api/me')).rejects.toBeInstanceOf(ApiRequestError);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ code: 'unauthorized' });

    mockFetch(() => json({ error: { code: 'not_found', message: 'x' } }, 404));
    await expect(request('/api/x')).rejects.toBeInstanceOf(ApiRequestError);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('requestPage', () => {
  it('returns data and nextCursor', async () => {
    mockFetch(() => json({ data: [{ id: 1 }], nextCursor: 'c1' }));
    await expect(requestPage('/api/x')).resolves.toEqual({ data: [{ id: 1 }], nextCursor: 'c1' });
  });

  it('defaults missing fields', async () => {
    mockFetch(() => json({}));
    await expect(requestPage('/api/x')).resolves.toEqual({ data: [], nextCursor: null });
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(requestPage('/api/x')).resolves.toEqual({ data: [], nextCursor: null });
  });
});

describe('apiFetch', () => {
  it('returns the raw response for non-JSON endpoints', async () => {
    mockFetch(() => new Response('id,created_at\r\n', { status: 200, headers: { 'x-next-cursor': 'abc' } }));
    const res = await apiFetch('/api/forms/x/export', { query: { format: 'csv' }, headers: { accept: 'text/csv' } });
    expect(res.headers.get('x-next-cursor')).toBe('abc');
    expect(await res.text()).toBe('id,created_at\r\n');
  });
});
