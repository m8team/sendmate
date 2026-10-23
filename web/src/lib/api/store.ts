/**
 * Page-wide cache for data several islands need (the rail and the page both want /api/me and
 * /api/forms). Vite bundles this module once per page, so every importer shares the same Map.
 */
import type { EmailSettingsDto, FormDto, MeDto } from '@sendm8/shared';
import { api } from './endpoints';
import { getUnreadCache, setUnreadCache, countUnread, type UnreadCache } from './readState';

const cache = new Map<string, Promise<unknown>>();

export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    cache.set(key, p);
    // Don't cache failures: the next caller should try again.
    p.catch(() => cache.get(key) === p && cache.delete(key));
  }
  return p;
}

export function invalidate(prefix = '') {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
}

export const loadMe = () => cached<MeDto>('me', api.me);
/** A failed probe (e.g. auth not mounted) counts as "maybe": /api/me decides. */
export const loadHasSession = () => cached<boolean>('has-session', () => api.hasSession().catch(() => true));
/** The deployment's effective limits (defaults plus LIMITS_JSON overrides). */
export const loadLimits = () => loadMe().then((me) => me.limits);
export const loadForms = () => cached<FormDto[]>('forms', api.listForms);

export const loadEmailSettings = () => cached<EmailSettingsDto>('email-settings', api.emailSettings);
export const loadStats = (formId: string) => cached(`stats:${formId}`, () => api.stats(formId, 30));

// ── Cross-island events ────────────────────────────────────────────────────

export const FORMS_CHANGED = 'sendm8:forms-changed';
export const UNREAD_CHANGED = 'sendm8:unread-changed';

/** Tell the rail (and anyone else) that forms were created, renamed, paused or deleted. */
export function announceFormsChanged() {
  invalidate('forms');
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FORMS_CHANGED));
}

export function announceUnread(formId: string, count: number, more = false) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UNREAD_CHANGED, { detail: { formId, count, more } }));
}

/** How many unread submissions sit in a form's inbox. Uses the cached count unless something new arrived. */
export async function unreadFor(form: Pick<FormDto, 'id' | 'lastSubmissionAt'>, limit = 100): Promise<UnreadCache> {
  const hit = getUnreadCache(form.id);
  if (form.lastSubmissionAt === null) return { last: null, count: 0, more: false };
  if (hit && hit.last === form.lastSubmissionAt) return hit;
  return cached(`unread:${form.id}:${form.lastSubmissionAt}`, async () => {
    const page = await api.listSubmissions(form.id, { filter: 'inbox', limit });
    const value: UnreadCache = {
      last: form.lastSubmissionAt,
      count: countUnread(
        form.id,
        page.data.map((s) => s.id),
      ),
      more: page.nextCursor !== null,
    };
    setUnreadCache(form.id, value);
    return value;
  });
}
