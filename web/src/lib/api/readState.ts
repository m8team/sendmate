/**
 * "Read" isn't stored by the API, so it lives per browser in localStorage.
 * Also caches unread counts for the sidebar, keyed by the form's last submission time,
 * so the rack and rail only refetch a form's inbox when something new arrived.
 */

const READ_KEY = (formId: string) => `sendm8-read-v1:${formId}`;
const UNREAD_KEY = (formId: string) => `sendm8-unread-v1:${formId}`;
/** Keep the newest ids only, so storage can't grow forever. */
export const MAX_READ_IDS = 2000;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: read state just won't persist */
  }
}

export function readIds(formId: string): Set<string> {
  const ids = readJson<string[]>(READ_KEY(formId));
  return new Set(Array.isArray(ids) ? ids : []);
}

export function isRead(formId: string, id: string) {
  return readIds(formId).has(id);
}

export function markRead(formId: string, ids: string[]) {
  if (!ids.length) return;
  const set = readIds(formId);
  const before = set.size;
  ids.forEach((id) => set.add(id));
  if (set.size === before) return;
  // ULIDs sort by time, so the newest ids are the largest.
  const kept = [...set].sort().slice(-MAX_READ_IDS);
  writeJson(READ_KEY(formId), kept);
}

export function forgetForm(formId: string) {
  try {
    storage()?.removeItem(READ_KEY(formId));
    storage()?.removeItem(UNREAD_KEY(formId));
  } catch {
    /* ignore */
  }
}

export interface UnreadCache {
  /** The form's lastSubmissionAt when the count was taken. */
  last: number | null;
  count: number;
  /** True when there were more submissions than we counted. */
  more: boolean;
}

export const getUnreadCache = (formId: string) => readJson<UnreadCache>(UNREAD_KEY(formId));
export const setUnreadCache = (formId: string, value: UnreadCache) => writeJson(UNREAD_KEY(formId), value);

export function countUnread(formId: string, ids: string[]) {
  const read = readIds(formId);
  return ids.filter((id) => !read.has(id)).length;
}
