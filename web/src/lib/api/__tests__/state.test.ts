import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '@sendm8/shared';
import { ApiRequestError } from '../client';
import { MAX_READ_IDS, countUnread, forgetForm, getUnreadCache, isRead, markRead, readIds, setUnreadCache } from '../readState';
import { FORMS_CHANGED, UNREAD_CHANGED, announceFormsChanged, announceUnread, cached, invalidate, loadEmailSettings, loadForms, loadMe, loadStats, unreadFor } from '../store';
import { SIGN_IN_PATH, SUSPENDED_PATH, formIdFromPath, guardSession, initials } from '../session';
import { json, mockFetch, stubStorage, stubWindow } from './helpers';

beforeEach(() => {
  invalidate();
});

describe('readState', () => {
  it('remembers read ids per form', () => {
    stubStorage();
    expect(isRead('f1', 'a')).toBe(false);
    markRead('f1', ['a', 'b']);
    markRead('f1', []);
    markRead('f1', ['a']);
    expect(isRead('f1', 'a')).toBe(true);
    expect(isRead('f2', 'a')).toBe(false);
    expect(countUnread('f1', ['a', 'b', 'c'])).toBe(1);
  });

  it('keeps only the newest ids', () => {
    const map = stubStorage();
    const ids = Array.from({ length: MAX_READ_IDS + 10 }, (_, i) => `id${String(i).padStart(5, '0')}`);
    markRead('f1', ids);
    const kept = JSON.parse(map.get('sendm8-read-v1:f1')!);
    expect(kept).toHaveLength(MAX_READ_IDS);
    expect(kept[0]).toBe('id00010');
  });

  it('survives corrupt or missing storage', () => {
    const map = stubStorage();
    map.set('sendm8-read-v1:f1', '{nope');
    expect(readIds('f1').size).toBe(0);
    map.set('sendm8-read-v1:f1', '{"not":"an array"}');
    expect(readIds('f1').size).toBe(0);
    vi.stubGlobal('localStorage', undefined);
    expect(readIds('f1').size).toBe(0);
    expect(() => markRead('f1', ['a'])).not.toThrow();
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readIds('f1').size).toBe(0);
    expect(() => markRead('f1', ['a'])).not.toThrow();
    expect(() => forgetForm('f1')).not.toThrow();
  });

  it('caches unread counts and forgets forms', () => {
    stubStorage();
    setUnreadCache('f1', { last: 5, count: 3, more: false });
    markRead('f1', ['a']);
    expect(getUnreadCache('f1')).toEqual({ last: 5, count: 3, more: false });
    forgetForm('f1');
    expect(getUnreadCache('f1')).toBeNull();
    expect(readIds('f1').size).toBe(0);
  });
});

describe('store', () => {
  it('shares one request between callers and caches the result', async () => {
    const load = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cached('k', load), cached('k', load)]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
    invalidate('k');
    await cached('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('ok');
    await expect(cached('fail', load)).rejects.toThrow('x');
    await Promise.resolve();
    await expect(cached('fail', load)).resolves.toBe('ok');
  });

  it('loaders hit the API once per page', async () => {
    const { calls } = mockFetch((call) => json({ data: call.url.includes('stats') ? [{ day: 'd', submissions: 1 }] : {} }));
    await Promise.all([loadMe(), loadMe(), loadForms(), loadEmailSettings(), loadStats('f1'), loadStats('f1')]);
    expect(calls.map((c) => c.url).sort()).toEqual(['/api/forms', '/api/forms/f1/stats?days=30', '/api/me', '/api/settings/email']);
  });

  it('announces changes on window, and is quiet without one', () => {
    announceFormsChanged();
    announceUnread('f1', 1);
    const win = stubWindow();
    const seen: string[] = [];
    win.addEventListener(FORMS_CHANGED, () => seen.push('forms'));
    win.addEventListener(UNREAD_CHANGED, (e) => seen.push(JSON.stringify((e as CustomEvent).detail)));
    announceFormsChanged();
    announceUnread('f1', 3, true);
    expect(seen).toEqual(['forms', '{"formId":"f1","count":3,"more":true}']);
  });

  describe('unreadFor', () => {
    it('is zero for a form that never got anything', async () => {
      const { calls } = mockFetch();
      await expect(unreadFor({ id: 'f1', lastSubmissionAt: null })).resolves.toEqual({ last: null, count: 0, more: false });
      expect(calls).toHaveLength(0);
    });

    it('uses the cache while nothing new has arrived', async () => {
      stubStorage();
      setUnreadCache('f1', { last: 100, count: 7, more: false });
      const { calls } = mockFetch();
      await expect(unreadFor({ id: 'f1', lastSubmissionAt: 100 })).resolves.toEqual({ last: 100, count: 7, more: false });
      expect(calls).toHaveLength(0);
    });

    it('counts the inbox when something new arrived', async () => {
      stubStorage();
      setUnreadCache('f1', { last: 100, count: 7, more: false });
      markRead('f1', ['a']);
      const { calls } = mockFetch(() => json({ data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], nextCursor: 'c' }));
      await expect(unreadFor({ id: 'f1', lastSubmissionAt: 200 })).resolves.toEqual({ last: 200, count: 2, more: true });
      expect(calls[0].url).toBe('/api/forms/f1/submissions?filter=inbox&limit=100');
      expect(getUnreadCache('f1')).toEqual({ last: 200, count: 2, more: true });
    });
  });
});

describe('session', () => {
  const yes = async () => true;

  it('resolves the user when signed in', async () => {
    const nav = vi.fn();
    const me = { user: { id: 'u', name: 'A', email: 'a@x.com', image: null }, limits: LIMITS };
    await expect(guardSession(nav, async () => me, yes)).resolves.toBe(me);
    expect(nav).not.toHaveBeenCalled();
  });

  it('skips /api/me when the session probe says signed out', async () => {
    const nav = vi.fn();
    const load = vi.fn();
    await expect(guardSession(nav, load, async () => false)).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith(SIGN_IN_PATH);
  });

  it('sends signed-out visitors to sign-in', async () => {
    const nav = vi.fn();
    await expect(guardSession(nav, async () => Promise.reject(new ApiRequestError(401, 'unauthorized', 'x')), yes)).resolves.toBeNull();
    expect(nav).toHaveBeenCalledWith(SIGN_IN_PATH);
  });

  it('sends suspended accounts to the suspended notice', async () => {
    const nav = vi.fn();
    await expect(guardSession(nav, async () => Promise.reject(new ApiRequestError(403, 'account_suspended', 'x')), yes)).resolves.toBeNull();
    expect(nav).toHaveBeenCalledWith(SUSPENDED_PATH);
  });

  it('rethrows anything else', async () => {
    await expect(guardSession(vi.fn(), async () => Promise.reject(new ApiRequestError(0, 'network', 'offline')), yes)).rejects.toMatchObject({ code: 'network' });
  });

  it('probes the session, then /api/me, and uses window.location by default', async () => {
    const win = stubWindow() as unknown as { location: { replace: ReturnType<typeof vi.fn> } };
    const { calls } = mockFetch((call) => (call.url === '/api/auth/get-session' ? json({ session: { id: 's' } }) : json({ error: { code: 'unauthorized', message: 'x' } }, 401)));
    await expect(guardSession()).resolves.toBeNull();
    expect(calls.map((c) => c.url)).toEqual(['/api/auth/get-session', '/api/me']);
    expect(win.location.replace).toHaveBeenCalledWith(SIGN_IN_PATH);
  });

  it('treats a failing session probe as "ask /api/me"', async () => {
    stubWindow();
    const { calls } = mockFetch(() => json({ error: { code: 'unauthorized', message: 'x' } }, 401));
    await expect(guardSession()).resolves.toBeNull();
    expect(calls.map((c) => c.url)).toEqual(['/api/auth/get-session', '/api/me']);
  });

  it('reads valid form ids from the path', () => {
    expect(formIdFromPath('/app/forms/k3x9q2m7ab')).toBe('k3x9q2m7ab');
    expect(formIdFromPath('/app/forms/k3x9q2m7ab/settings')).toBe('k3x9q2m7ab');
    expect(formIdFromPath('/app/forms/_/')).toBeNull();
    expect(formIdFromPath('/app/forms/K3X9Q2M7AB')).toBeNull();
    expect(formIdFromPath('/app/forms/k3x9q2m7ai')).toBeNull();
    expect(formIdFromPath('/app')).toBeNull();
  });

  it('makes initials', () => {
    expect(initials('Robin van Achterberg')).toBe('RA');
    expect(initials('Cher')).toBe('CH');
    expect(initials('', 'dev@sendm8.local')).toBe('DE');
    expect(initials('')).toBe('··');
  });
});
