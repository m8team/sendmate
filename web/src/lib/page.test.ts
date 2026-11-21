// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hydrateEndpoint, hydrateFormLinks, setCrumb } from './page';

describe('page helpers', () => {
  it('points form links at the form', () => {
    document.body.innerHTML = '<a data-form-href="/settings" aria-disabled="true">Settings</a>';
    hydrateFormLinks('abc123');
    const a = document.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/app/forms/abc123/settings');
    expect(a.hasAttribute('aria-disabled')).toBe(false);
  });

  it('arms the copy-endpoint button and shows it', () => {
    document.body.innerHTML = '<button data-form-endpoint hidden>Copy endpoint</button>';
    hydrateEndpoint('https://sendm8.com/f/abc123');
    const btn = document.querySelector<HTMLButtonElement>('button')!;
    expect(btn.dataset.copy).toBe('https://sendm8.com/f/abc123');
    expect(btn.hidden).toBe(false);
  });

  it('renames a breadcrumb by position', () => {
    document.body.innerHTML = '<a data-crumb="1" href="/app">Loading…</a>';
    setCrumb(1, 'Contact', '/app/forms/abc123');
    const a = document.querySelector('a')!;
    expect(a.textContent).toBe('Contact');
    expect(a.getAttribute('href')).toBe('/app/forms/abc123');
  });
});
