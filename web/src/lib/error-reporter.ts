/**
 * Sends crashes from the site and dashboard to POST /api/errors, where the Worker groups them like
 * Sentry issues and alerts the admins. Installed once per page from the base layout; Vue components
 * report through the app entrypoint (src/vue-app.ts).
 */

export interface ErrorExtra {
  kind?: 'error' | 'unhandledrejection' | 'vue';
  component?: string;
  info?: string;
}

/** A page that keeps failing shouldn't flood the endpoint (it's rate limited anyway). */
const MAX_REPORTS_PER_PAGE = 10;

function describe(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name || 'Error', message: error.message, stack: error.stack };
  if (typeof error === 'string') return { name: 'Error', message: error };
  try {
    return { name: 'NonError', message: JSON.stringify(error) ?? String(error) };
  } catch {
    return { name: 'NonError', message: String(error) };
  }
}

/** Errors nobody can act on: cross-origin scripts, browser extensions, a harmless Chrome warning. */
export function isNoise(message: string, stack?: string) {
  if (!message.trim() || /^Script error\.?$/i.test(message.trim()) || /ResizeObserver loop/i.test(message)) return true;
  return /(chrome|moz|safari(-web)?)-extension:\/\//i.test(`${message}\n${stack ?? ''}`);
}

export function createErrorReporter(send: (body: string) => void, { max = MAX_REPORTS_PER_PAGE, page = () => location.href } = {}) {
  const seen = new Set<string>();
  return function report(error: unknown, extra: ErrorExtra = {}): boolean {
    const { name, message, stack } = describe(error);
    if (isNoise(message, stack)) return false;
    const key = `${name}:${message}`;
    if (seen.has(key) || seen.size >= max) return false;
    seen.add(key);
    try {
      send(JSON.stringify({ name, message: message.slice(0, 2000), stack: stack?.slice(0, 8000), page: page(), ...extra }));
    } catch {
      // Reporting must never cause an error of its own.
    }
    return true;
  };
}

const sendToApi = (body: string) => {
  // keepalive lets a report sent while the page unloads still arrive.
  void fetch('/api/errors', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body }).catch(() => {});
};

/** Shared by the window listeners and the Vue error handler, so one crash is reported once. */
export const reportError = createErrorReporter(sendToApi);

/** Listens for uncaught errors and rejections. Off in dev, where the API usually isn't on the same origin. */
export function installErrorReporter(target: Pick<Window, 'addEventListener'> = window, report = reportError, enabled = !import.meta.env.DEV) {
  if (!enabled) return false;
  target.addEventListener('error', (event) => {
    // Failed <img>/<script> loads fire here too, with no error object and no message.
    const e = event as ErrorEvent;
    if (e.error || e.message) report(e.error ?? e.message, { kind: 'error' });
  });
  target.addEventListener('unhandledrejection', (event) => report((event as PromiseRejectionEvent).reason, { kind: 'unhandledrejection' }));
  return true;
}
