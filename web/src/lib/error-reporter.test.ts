import { describe, expect, it, vi } from 'vitest';
import { createErrorReporter, installErrorReporter, isNoise } from './error-reporter';

const page = () => 'https://sendm8.com/app';

describe('createErrorReporter', () => {
  it('sends the error with its stack, page and extra context', () => {
    const send = vi.fn();
    const report = createErrorReporter(send, { page });
    const error = new TypeError('x is undefined');
    expect(report(error, { kind: 'vue', component: 'InboxApp', info: 'mounted hook' })).toBe(true);
    expect(JSON.parse(send.mock.calls[0]![0])).toEqual({
      name: 'TypeError',
      message: 'x is undefined',
      stack: error.stack,
      page: 'https://sendm8.com/app',
      kind: 'vue',
      component: 'InboxApp',
      info: 'mounted hook',
    });
  });

  it('reports each distinct error once, up to a cap per page', () => {
    const send = vi.fn();
    const report = createErrorReporter(send, { max: 2, page });
    expect(report(new Error('a'))).toBe(true);
    expect(report(new Error('a'))).toBe(false);
    expect(report('b')).toBe(true);
    expect(report({ code: 3 })).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(send.mock.calls[1]![0])).toMatchObject({ name: 'Error', message: 'b' });
  });

  it('describes non-errors and survives a failing sender', () => {
    const report = createErrorReporter(() => {
      throw new Error('offline');
    }, { page });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(report({ code: 3 })).toBe(true);
    expect(report(circular)).toBe(true);
  });

  it('ignores noise', () => {
    const send = vi.fn();
    const report = createErrorReporter(send, { page });
    expect(report('Script error.')).toBe(false);
    expect(report(new Error('ResizeObserver loop completed with undelivered notifications.'))).toBe(false);
    expect(isNoise('boom', 'at chrome-extension://abc/content.js:1:1')).toBe(true);
    expect(isNoise('boom')).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('installErrorReporter', () => {
  function fakeWindow() {
    const listeners: Record<string, (event: unknown) => void> = {};
    return { listeners, target: { addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn) } as unknown as Window };
  }

  it('reports uncaught errors and rejections, but not failed resource loads', () => {
    const { listeners, target } = fakeWindow();
    const report = vi.fn();
    expect(installErrorReporter(target, report, true)).toBe(true);

    const error = new Error('boom');
    listeners.error!({ error, message: 'boom' });
    listeners.error!({ error: null, message: '' });
    listeners.unhandledrejection!({ reason: 'nope' });
    expect(report.mock.calls).toEqual([
      [error, { kind: 'error' }],
      ['nope', { kind: 'unhandledrejection' }],
    ]);
  });

  it('stays off when disabled', () => {
    const { listeners, target } = fakeWindow();
    expect(installErrorReporter(target, vi.fn(), false)).toBe(false);
    expect(listeners).toEqual({});
  });

  it('posts to the API with keepalive', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { href: 'https://sendm8.com/pricing' });
    const { reportError } = await import('./error-reporter');
    reportError(new Error(`sent ${Math.random()}`));
    expect(fetchMock).toHaveBeenCalledWith('/api/errors', expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'same-origin' }));
  });
});
