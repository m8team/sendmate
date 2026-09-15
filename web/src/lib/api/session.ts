/** Auth guard for /app pages, plus helpers for reading the form id out of the URL. */
import type { MeDto } from '@sendm8/shared';
import { isApiError } from './client';
import { loadHasSession, loadMe } from './store';

export const SIGN_IN_PATH = '/app/sign-in';
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
      navigate(SIGN_IN_PATH);
      return null;
    }
    return await load();
  } catch (err) {
    if (isApiError(err) && err.status === 401) {
      navigate(SIGN_IN_PATH);
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
