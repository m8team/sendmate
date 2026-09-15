import { vi } from 'vitest';

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  init: RequestInit;
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/** Stubs global fetch. The handler gets each call and returns a Response (or throws). */
export function mockFetch(handler: (call: Call) => Response | Promise<Response> = () => json({ data: null })) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: (init.headers as Record<string, string>) ?? {},
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
      init,
    };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

/** A tiny in-memory localStorage. */
export function stubStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  return map;
}

/** A window that can dispatch events, for the cross-island announcements. */
export function stubWindow() {
  const target = new EventTarget();
  vi.stubGlobal('window', Object.assign(target, { location: { replace: vi.fn(), href: '' } }));
  return target;
}
