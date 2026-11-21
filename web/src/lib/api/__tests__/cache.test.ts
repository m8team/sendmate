import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATA_REFRESHED,
  clearCache,
  inboxKey,
  inboxSnapshot,
  invalidate,
  loadForms,
  loadHasSession,
  markStale,
  peek,
  prefetchForm,
  rememberInbox,
  setCached,
  swr,
  takePrefetchedInbox,
} from '../store';
import { json, mockFetch, stubWindow } from './helpers';

/** A tiny in-memory sessionStorage (helpers.ts has the localStorage one). */
function stubSession() {
  const map = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
  });
  return map;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let now = 1_000_000;
beforeEach(() => {
  clearCache();
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('swr', () => {
  it('answers from cache while fresh, then serves stale and refreshes once', async () => {
    let n = 0;
    const load = vi.fn(async () => ++n);
    expect(await swr('k', load, 1000)).toBe(1);
    expect(await swr('k', load, 1000)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);

    now += 1000;
    const stale = swr('k', load, 1000); // stale: answered at once with the old value
    const again = swr('k', load, 1000); // the refresh is already under way, not started twice
    expect(await stale).toBe(1);
    expect(await again).toBe(1);
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
    expect(await swr('k', load, 1000)).toBe(2);
  });

  it('announces a refresh only when the value changed', async () => {
    const win = stubWindow();
    const seen: string[] = [];
    win.addEventListener(DATA_REFRESHED, (e) => seen.push((e as CustomEvent<{ key: string }>).detail.key));
    let value = 'a';
    const load = async () => value;
    await swr('k', load, 0);
    await swr('k', load, 0);
    await flush();
    expect(seen).toEqual([]);
    value = 'b';
    await swr('k', load, 0);
    await flush();
    expect(seen).toEqual(['k']);
    expect(peek('k')).toBe('b');
  });

  it('keeps showing the old value when a refresh fails', async () => {
    let fail = false;
    const load = vi.fn(async () => {
      if (fail) throw new Error('offline');
      return 'kept';
    });
    await swr('k', load, 0);
    fail = true;
    expect(await swr('k', load, 0)).toBe('kept');
    await flush();
    expect(peek('k')).toBe('kept');
  });

  it('does not cache a first load that failed', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('ok');
    await expect(swr('k', load, 1000)).rejects.toThrow('x');
    await flush();
    await expect(swr('k', load, 1000)).resolves.toBe('ok');
  });
});

describe('persisted values', () => {
  it('paints from sessionStorage after a reload, then refreshes', async () => {
    const store = stubSession();
    store.set('sendm8-cache-v1:forms', JSON.stringify({ at: now - 60_000, value: [{ id: 'old' }] }));
    const { calls } = mockFetch(() => json({ data: [{ id: 'new' }] }));
    expect(await loadForms()).toEqual([{ id: 'old' }]);
    await flush();
    expect(calls.map((c) => new URL(c.url, 'http://x').pathname)).toEqual(['/api/forms']);
    expect(peek('forms')).toEqual([{ id: 'new' }]);
    expect(JSON.parse(store.get('sendm8-cache-v1:forms')!).value).toEqual([{ id: 'new' }]);
  });

  it('only keeps the shared per-user values, and forgets them on invalidate and clearCache', () => {
    const store = stubSession();
    setCached('forms', []);
    setCached('form:abc', { id: 'abc' });
    expect([...store.keys()]).toEqual(['sendm8-cache-v1:forms']);
    invalidate('forms');
    expect(store.size).toBe(0);
    setCached('me', { user: {} });
    clearCache();
    expect(store.size).toBe(0);
    expect(peek('me')).toBeUndefined();
  });

  it('ignores storage that is missing or corrupt', async () => {
    const store = stubSession();
    store.set('sendm8-cache-v1:forms', '{nope');
    mockFetch(() => json({ data: [] }));
    await expect(loadForms()).resolves.toEqual([]);
    vi.stubGlobal('sessionStorage', undefined);
    setCached('forms', [1]);
    expect(peek('forms')).toEqual([1]);
  });
});

describe('setCached, markStale and peek', () => {
  it('seeds a value as fresh, and marking it stale refreshes it on next use', async () => {
    const load = vi.fn(async () => 'server');
    setCached('k', 'saved');
    expect(await swr('k', load, 60_000)).toBe('saved');
    expect(load).not.toHaveBeenCalled();
    markStale('k');
    expect(await swr('k', load, 60_000)).toBe('saved');
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(peek('k')).toBe('server');
  });
});

describe('loadHasSession', () => {
  it('skips the session probe when /api/me is already cached', async () => {
    const { calls } = mockFetch(() => json({ data: null }));
    setCached('me', { user: { id: 'u' } });
    await expect(loadHasSession()).resolves.toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe('prefetch and inbox snapshots', () => {
  it('hands a prefetched first page to the inbox once, while it is fresh', async () => {
    const { calls } = mockFetch((c) => (c.url.includes('/submissions') ? json({ data: [{ id: 's1' }], nextCursor: null }) : json({ data: {} })));
    prefetchForm('abc1234567');
    prefetchForm('abc1234567');
    expect(calls.filter((c) => c.url.includes('/submissions'))).toHaveLength(1);
    await expect(takePrefetchedInbox('abc1234567')).resolves.toMatchObject({ data: [{ id: 's1' }] });
    expect(takePrefetchedInbox('abc1234567')).toBeUndefined();

    prefetchForm('abc1234567');
    now += 20_000;
    expect(takePrefetchedInbox('abc1234567')).toBeUndefined();
  });

  it('skips the inbox page when a snapshot will be shown anyway', () => {
    const { calls } = mockFetch(() => json({ data: {} }));
    rememberInbox(inboxKey('abc1234567', 'inbox'), { items: [{ id: 's1' }], nextCursor: null });
    prefetchForm('abc1234567');
    expect(calls.some((c) => c.url.includes('/submissions'))).toBe(false);
    expect(inboxSnapshot(inboxKey('abc1234567', 'inbox'))).toEqual({ items: [{ id: 's1' }], nextCursor: null });
    clearCache();
    expect(inboxSnapshot(inboxKey('abc1234567', 'inbox'))).toBeUndefined();
  });
});
