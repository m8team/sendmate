// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vitest runs from web/. (import.meta.url isn't a file: URL under jsdom.)
const SCRIPT = readFileSync(resolve(process.cwd(), 'public/s/v1.js'), 'utf8');

type Sendm8 = {
  version: string;
  submit: (form: HTMLFormElement, submitter?: HTMLElement) => Promise<{ ok: boolean; id?: string; error?: { code: string; message: string } }>;
  isEndpoint: (url: string) => boolean;
};
const api = () => (window as unknown as { sendm8: Sendm8 }).sendm8;

let listeners: [string, EventListenerOrEventListenerObject][] = [];

function load() {
  // Track the script's document listener so each test starts clean.
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject) => {
    listeners.push([type, fn]);
    add(type, fn);
  });
  new Function(SCRIPT)();
}

function respond(body: unknown, status = 200) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function form(html: string, attrs = 'data-sendm8', action = 'https://sendm8.com/f/k3x9q2m7ab') {
  document.body.innerHTML = `<form action="${action}" method="POST" ${attrs}>${html}</form><div id="thanks" hidden>Cheers!</div><p id="oops" hidden></p>`;
  return document.querySelector('form') as HTMLFormElement;
}

function submitForm(f: HTMLFormElement, submitter?: HTMLElement) {
  const ev = new Event('submit', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'submitter', { value: submitter ?? null });
  f.dispatchEvent(ev);
  return ev;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  delete (window as unknown as { sendm8?: unknown }).sendm8;
  load();
});

afterEach(() => {
  listeners.forEach(([type, fn]) => document.removeEventListener(type, fn));
  listeners = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('sendm8 v1 helper', () => {
  it('exposes a small API and recognises endpoints', () => {
    expect(api().version).toBe('1');
    expect(api().isEndpoint('https://sendm8.com/f/k3x9q2m7ab')).toBe(true);
    expect(api().isEndpoint('http://localhost:8787/f/you@example.com')).toBe(true);
    expect(api().isEndpoint('https://example.com/contact')).toBe(false);
    expect(api().isEndpoint('mailto:hi@example.com')).toBe(false);
    expect(api().isEndpoint('')).toBe(false);
  });

  it('does not overwrite an existing window.sendm8', () => {
    const mine = { version: 'custom' };
    (window as unknown as { sendm8: unknown }).sendm8 = mine;
    new Function(SCRIPT)();
    expect(api()).toBe(mine);
  });

  it('posts FormData with Accept: application/json, then shows the default message and resets', async () => {
    const fetch = respond({ ok: true, id: '01jabc' });
    const f = form('<input name="email"><button>Send</button>');
    (f.querySelector('input') as HTMLInputElement).value = 'a@b.com';
    const button = f.querySelector('button')!;
    const onSuccess = vi.fn();
    f.addEventListener('sendm8:success', onSuccess);

    const ev = submitForm(f, button);
    expect(ev.defaultPrevented).toBe(true);
    expect(button.disabled).toBe(true);
    expect(f.getAttribute('aria-busy')).toBe('true');

    await flush();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sendm8.com/f/k3x9q2m7ab');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('email')).toBe('a@b.com');
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');

    expect(button.disabled).toBe(false);
    expect(f.hasAttribute('aria-busy')).toBe(false);
    expect((f.querySelector('input') as HTMLInputElement).value).toBe('');
    const status = f.querySelector('[role="status"]')!;
    expect(status.textContent).toBe('Thanks! Message sent.');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0].detail).toMatchObject({ id: '01jabc' });
  });

  it('uses data-sendm8-success text or reveals a selected element', async () => {
    respond({ ok: true, id: 'x' });
    let f = form('<button>Send</button>', 'data-sendm8 data-sendm8-success="Ta, we’ll be in touch."');
    submitForm(f);
    await flush();
    expect(f.querySelector('[role="status"]')!.textContent).toBe('Ta, we’ll be in touch.');

    f = form('<button>Send</button>', 'data-sendm8 data-sendm8-success="#thanks"');
    submitForm(f);
    await flush();
    expect((document.getElementById('thanks') as HTMLElement).hidden).toBe(false);
    expect(f.querySelector('[role="status"]')).toBeNull();
  });

  it('includes the clicked submit button’s name and value', async () => {
    const fetch = respond({ ok: true, id: 'x' });
    const f = form('<button name="plan" value="pro">Pro</button>');
    submitForm(f, f.querySelector('button')!);
    await flush();
    expect(((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData).get('plan')).toBe('pro');
  });

  it('shows the API error in an auto-inserted alert and dispatches sendm8:error', async () => {
    respond({ ok: false, error: { code: 'form_paused', message: 'This form isn’t accepting submissions right now.' } }, 423);
    const f = form('<input name="email" value="keep@me.com"><button>Send</button>');
    const onError = vi.fn();
    f.addEventListener('sendm8:error', onError);
    submitForm(f);
    await flush();
    const alert = f.querySelector('[role="alert"]')!;
    expect(alert.textContent).toBe('This form isn’t accepting submissions right now.');
    expect((f.querySelector('input') as HTMLInputElement).value).toBe('keep@me.com');
    expect(onError.mock.calls[0][0].detail).toMatchObject({ code: 'form_paused', status: 423 });

    // The next attempt clears the old message first.
    respond({ ok: true, id: 'x' });
    submitForm(f);
    expect((f.querySelector('[role="alert"]') as HTMLElement).hidden).toBe(true);
    await flush();
  });

  it('puts errors in data-sendm8-error, and copes with string errors and non-JSON', async () => {
    respond({ ok: false, error: 'This form is full for this month.' }, 429);
    const f = form('<button>Send</button>', 'data-sendm8 data-sendm8-error="#oops"');
    submitForm(f);
    await flush();
    const oops = document.getElementById('oops') as HTMLElement;
    expect(oops.hidden).toBe(false);
    expect(oops.textContent).toBe('This form is full for this month.');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    submitForm(f);
    await flush();
    expect(oops.textContent).toBe('Something went wrong. Please try again.');
  });

  it('reports network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    const f = form('<button>Send</button>');
    const result = await api().submit(f);
    expect(result).toMatchObject({ ok: false, error: { code: 'network' } });
    expect(f.querySelector('[role="alert"]')!.textContent).toMatch(/connection/);
  });

  it('lets listeners cancel the built-in message', async () => {
    respond({ ok: true, id: 'x' });
    const f = form('<input name="n" value="stay"><button>Send</button>');
    f.addEventListener('sendm8:success', (e) => e.preventDefault());
    submitForm(f);
    await flush();
    expect(f.querySelector('[role="status"]')).toBeNull();
    expect((f.querySelector('input') as HTMLInputElement).value).toBe('stay');
  });

  it('ignores a second submit while sending', async () => {
    const fetch = respond({ ok: true, id: 'x' });
    const f = form('<button>Send</button>');
    submitForm(f);
    const busy = await api().submit(f);
    expect(busy).toMatchObject({ ok: false, error: { code: 'busy' } });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps a button that was already disabled disabled', async () => {
    respond({ ok: true, id: 'x' });
    const f = form('<button>Send</button><button disabled>Other</button><button type="button">Not a submit</button>');
    submitForm(f);
    const [, other, plain] = Array.from(f.querySelectorAll('button'));
    expect(plain.disabled).toBe(false);
    await flush();
    expect(f.querySelector('button')!.disabled).toBe(false);
    expect(other.disabled).toBe(true);
  });

  it('leaves other forms alone so they post normally', () => {
    const fetch = respond({ ok: true });
    for (const [attrs, action] of [
      ['', 'https://sendm8.com/f/k3x9q2m7ab'],
      ['data-sendm8="off"', 'https://sendm8.com/f/k3x9q2m7ab'],
      ['data-sendm8', 'https://example.com/contact'],
    ]) {
      const f = form('<button>Send</button>', attrs, action);
      expect(submitForm(f).defaultPrevented).toBe(false);
    }
    const f = form('<button>Send</button>');
    f.addEventListener('submit', (e) => e.preventDefault(), { capture: true });
    submitForm(f);
    expect(fetch).not.toHaveBeenCalled();
  });
});
