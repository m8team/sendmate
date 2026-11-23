/** Auth guard for /app pages, plus helpers for reading the form id out of the URL. */
import type { MeDto } from '@sendm8/shared';
import { isApiError } from './client';
import { loadHasSession, loadMe } from './store';

export const SIGN_IN_PATH = '/app/sign-in';

/** Only dashboard pages are allowed as a post-sign-in destination (mirrors the Worker's safeNext). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/app') || next.startsWith('//') || next.includes('\\')) return '/app';
  try {
    const url = new URL(next, 'https://x.invalid');
    if (url.origin !== 'https://x.invalid' || url.pathname.replace(/\/+$/, '') === '/app/sign-in') return '/app';
    return url.pathname + url.search;
  } catch {
    return '/app';
  }
}

/** The `?next=` of a sign-in URL, made safe. */
export const nextFromSearch = (search: string) => safeNext(new URLSearchParams(search).get('next'));

/** Sign-in, coming back to `here` afterwards (the current page by default). */
export function signInUrl(here: string = typeof location === 'undefined' ? '/app' : location.pathname + location.search): string {
  const next = safeNext(here);
  return next === '/app' ? SIGN_IN_PATH : `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
}
export const SUSPENDED_PATH = '/blocked?reason=suspended';

/** Form ids: 10 chars of lowercase Crockford base32. Mirrors the Worker. */
export const FORM_ID_RE = /^[0-9a-hjkmnp-tv-z]{10}$/;

export type Navigate = (url: string) => void;
const defaultNavigate: Navigate = (url) => window.location.replace(url);

/**
 * Loads /api/me. Sends signed-out visitors to sign-in and suspended accounts to the suspended
 * notice, resolving `null` in both cases. Other errors are rethrown for the page to show.
 */
export async function guardSession(
  navigate: Navigate = defaultNavigate,
  load: () => Promise<MeDto> = loadMe,
  hasSession: () => Promise<boolean> = loadHasSession,
): Promise<MeDto | null> {
  try {
    // Check quietly first, so a signed-out visit doesn't leave a 401 in the console.
    if (!(await hasSession())) {
      navigate(signInUrl());
      return null;
    }
    return await load();
  } catch (err) {
    if (isApiError(err) && err.status === 401) {
      navigate(signInUrl());
      return null;
    }
    if (isApiError(err) && err.code === 'account_suspended') {
      navigate(SUSPENDED_PATH);
      return null;
    }
    throw err;
  }
}

/** `/app/forms/k3x9q2m7ab/settings` → `k3x9q2m7ab`. Null for anything that isn't a valid id. */
export function formIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/app\/forms\/([^/]+)/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return FORM_ID_RE.test(id) ? id : null;
}

export function initials(name: string, email = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase() || '··';
}
