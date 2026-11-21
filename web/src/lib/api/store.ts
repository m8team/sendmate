/**
 * Shared cache for data several islands need (the rail and the page both want /api/me and
 * /api/forms). The dashboard navigates client-side, so this module lives for the whole visit:
 * going from page to page reuses what's already loaded instead of fetching it all again.
 *
 * `cached` keeps a value until it's invalidated. `swr` (stale-while-revalidate) answers straight
 * away with what it has, refreshes in the background once the value is older than `maxAge`, and
 * announces DATA_REFRESHED when the fresh copy differs, so views can update quietly. A few small,
 * per-user values are also kept in sessionStorage, so even a hard reload paints at once.
 */
import type { ChannelDto, EmailAddressDto, EmailSettingsDto, FormDto, MeDto, SubmissionDto } from '@sendm8/shared';
import { api } from './endpoints';
import { getUnreadCache, setUnreadCache, countUnread, type UnreadCache } from './readState';

interface Entry {
  promise: Promise<unknown>;
  /** When the value was fetched (ms). */
  at: number;
  /** Set once the promise has resolved, so stale reads can answer synchronously. */
  value?: unknown;
  has: boolean;
  refreshing?: Promise<unknown>;
}

const cache = new Map<string, Entry>();

export const DATA_REFRESHED = 'sendm8:data-refreshed';

/** Survives a reload within the tab. Only small, per-user values; cleared on sign-out. */
const PERSISTED = new Set(['me', 'forms', 'email-settings']);
const STORE_KEY = (key: string) => `sendm8-cache-v1:${key}`;

function session(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readStored(key: string): { at: number; value: unknown } | null {
  if (!PERSISTED.has(key)) return null;
  try {
    const raw = session()?.getItem(STORE_KEY(key));
    const parsed = raw ? (JSON.parse(raw) as { at: number; value: unknown }) : null;
    return parsed && typeof parsed.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, at: number, value: unknown) {
  if (!PERSISTED.has(key)) return;
  try {
    session()?.setItem(STORE_KEY(key), JSON.stringify({ at, value }));
  } catch {
    /* full or blocked: it just won't survive a reload */
  }
}

function forgetStored(prefix: string) {
  const s = session();
  if (!s) return;
  try {
    for (const key of PERSISTED) if (key.startsWith(prefix)) s.removeItem(STORE_KEY(key));
  } catch {
    /* nothing stored, nothing to forget */
  }
}

function settle(key: string, entry: Entry, p: Promise<unknown>) {
  p.then(
    (value) => {
      if (cache.get(key) !== entry) return;
      entry.value = value;
      entry.has = true;
      entry.at = Date.now();
      writeStored(key, entry.at, value);
    },
    // Don't cache failures: the next caller should try again.
    () => cache.get(key) === entry && !entry.has && cache.delete(key),
  );
}

/** Keeps the value until it's invalidated. Callers asking at the same time share one request. */
export function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit.promise as Promise<T>;
  const entry: Entry = { promise: load(), at: Date.now(), has: false };
  cache.set(key, entry);
  settle(key, entry, entry.promise);
  return entry.promise as Promise<T>;
}

function refresh<T>(key: string, entry: Entry, load: () => Promise<T>) {
  if (entry.refreshing) return;
  const before = JSON.stringify(entry.value);
  entry.refreshing = load()
    .then((value) => {
      if (cache.get(key) !== entry) return;
      entry.value = value;
      entry.promise = Promise.resolve(value);
      entry.at = Date.now();
      writeStored(key, entry.at, value);
      if (JSON.stringify(value) !== before && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(DATA_REFRESHED, { detail: { key } }));
      }
    })
    .catch(() => {
      /* keep showing what we had; a 401 is handled by the API client */
    })
    .finally(() => {
      entry.refreshing = undefined;
    });
}

/**
 * Stale-while-revalidate: answers at once with whatever is cached (in memory, or from sessionStorage
 * after a reload), and refetches in the background when it's older than `maxAge` ms.
 */
export function swr<T>(key: string, load: () => Promise<T>, maxAge: number): Promise<T> {
  let entry = cache.get(key);
  if (!entry) {
    const stored = readStored(key);
    if (!stored) return cached(key, load);
    entry = { promise: Promise.resolve(stored.value), at: stored.at, value: stored.value, has: true };
    cache.set(key, entry);
  }
  if (entry.has && Date.now() - entry.at >= maxAge) refresh(key, entry, load);
  return entry.promise as Promise<T>;
}

/** Put a value we already have (e.g. the server's reply to a save) into the cache as fresh. */
export function setCached<T>(key: string, value: T) {
  const at = Date.now();
  cache.set(key, { promise: Promise.resolve(value), at, value, has: true });
  writeStored(key, at, value);
}

/** Keep showing these values, but refresh them on their next use. */
export function markStale(prefix: string) {
  for (const [key, entry] of cache) if (key.startsWith(prefix)) entry.at = 0;
}

/** Whatever is cached for `key` right now, without fetching. */
export function peek<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (entry?.has) return entry.value as T;
  const stored = readStored(key);
  return stored ? (stored.value as T) : undefined;
}

export function invalidate(prefix = '') {
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
  forgetStored(prefix);
}

/** Everything, including what's kept across reloads. For sign-out and an expired session. */
export function clearCache() {
  invalidate();
  inboxSnapshots.clear();
  prefetched.clear();
}

export const loadMe = () => swr<MeDto>('me', api.me, 60_000);
/**
 * A failed probe (e.g. auth not mounted) counts as "maybe": /api/me decides. With a cached /api/me
 * we skip the probe: if the session has gone, the refresh of /api/me gets a 401 and signs out.
 */
export const loadHasSession = () => (peek('me') ? Promise.resolve(true) : cached<boolean>('has-session', () => api.hasSession().catch(() => true)));
/** The deployment's effective limits (defaults plus LIMITS_JSON overrides). */
export const loadLimits = () => loadMe().then((me) => me.limits);
export const loadForms = () => swr<FormDto[]>('forms', api.listForms, 10_000);

export const loadEmailSettings = () => swr<EmailSettingsDto>('email-settings', api.emailSettings, 30_000);
export const loadEmails = () => swr<EmailAddressDto[]>('emails', api.listEmails, 10_000);
export const loadStats = (formId: string) => cached(`stats:${formId}`, () => api.stats(formId, 30));

/** One form and its channels: shown at once on a revisit, refreshed behind the scenes after 5s (so a hover prefetch isn't refetched on click). */
export const loadForm = (id: string) => swr<FormDto>(`form:${id}`, () => api.getForm(id), 5_000);
export const loadChannels = (id: string) => swr<ChannelDto[]>(`channels:${id}`, () => api.listChannels(id), 5_000);

// ── Inbox snapshots and prefetch ───────────────────────────────────────────

/** What an inbox showed when you left it, so coming back shows it at once while it refreshes. */
export interface InboxSnapshot<T> {
  items: T[];
  nextCursor: string | null;
}
const inboxSnapshots = new Map<string, InboxSnapshot<unknown>>();

export const inboxKey = (formId: string, filter: string) => `${formId}:${filter}`;

export function rememberInbox<T>(key: string, snap: InboxSnapshot<T>) {
  inboxSnapshots.set(key, snap);
}

export function inboxSnapshot<T>(key: string): InboxSnapshot<T> | undefined {
  return inboxSnapshots.get(key) as InboxSnapshot<T> | undefined;
}

type SubmissionPage = Awaited<ReturnType<typeof api.listSubmissions>>;
/** First inbox pages started on hover, used by the inbox if it opens within PREFETCH_TTL. */
const prefetched = new Map<string, { at: number; page: Promise<SubmissionPage> }>();
const PREFETCH_TTL = 15_000;
export const INBOX_PAGE_SIZE = 50;

/** Warm a form's header data and first inbox page, e.g. while the pointer is on its link. */
export function prefetchForm(id: string) {
  // Hover fires often: only fetch what isn't cached yet (visiting the page refreshes the rest).
  if (!cache.has(`form:${id}`)) loadForm(id).catch(() => {});
  if (!cache.has(`channels:${id}`)) loadChannels(id).catch(() => {});
  if (inboxSnapshots.has(inboxKey(id, 'inbox'))) return;
  const hit = prefetched.get(id);
  if (hit && Date.now() - hit.at < PREFETCH_TTL) return;
  const page = api.listSubmissions(id, { filter: 'inbox', limit: INBOX_PAGE_SIZE });
  page.catch(() => prefetched.delete(id));
  prefetched.set(id, { at: Date.now(), page });
}

/** A prefetched first inbox page, used once. Undefined when there isn't a fresh one. */
export function takePrefetchedInbox(id: string): Promise<{ data: SubmissionDto[]; nextCursor: string | null }> | undefined {
  const hit = prefetched.get(id);
  prefetched.delete(id);
  return hit && Date.now() - hit.at < PREFETCH_TTL ? hit.page : undefined;
}

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
