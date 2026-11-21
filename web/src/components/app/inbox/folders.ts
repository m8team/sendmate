/**
 * Pure folder logic for the inbox: which tabs show, what their counts say, and the copy
 * for empty folders and the export menu. No DOM, no API.
 */
import type { SubmissionFilter } from '@sendm8/shared';
import type { FolderCounts, Submission } from '../../../lib/api/types';

export type Filter = 'inbox' | 'unread' | 'starred' | 'spam' | 'held' | 'all';

export const FILTER_LABEL: Record<Filter, string> = { inbox: 'Inbox', unread: 'Unread', starred: 'Starred', spam: 'Spam', held: 'Held', all: 'All' };

/** The folder a link asked for (`?folder=spam`, used by the weekly spam email), or the inbox. */
export function filterFromSearch(search: string): Filter {
  const folder = new URLSearchParams(search).get('folder');
  return folder && Object.hasOwn(FILTER_LABEL, folder) ? (folder as Filter) : 'inbox';
}

/** "3 messages went to spam this week", or nothing when there's nothing to say. */
export function spamWeekNote(counts: FolderCounts | null | undefined): string | null {
  const n = counts?.spamThisWeek ?? 0;
  if (n <= 0) return null;
  return n === 1 ? '1 message went to spam this week.' : `${n} messages went to spam this week.`;
}

/** Unread is the inbox, filtered in the browser (read state lives in localStorage). */
export const apiFilter = (f: Filter): SubmissionFilter => (f === 'unread' ? 'inbox' : f);

/** Counts this browser worked out for folders it has loaded. */
export type LocalCounts = Partial<Record<Filter, { n: number; more: boolean }>>;

export interface FolderTab {
  key: Filter;
  label: string;
  count: string;
}

export function inFilter(s: Submission, f: Filter) {
  switch (f) {
    case 'inbox':
      return s.status === 'ok';
    case 'unread':
      return s.status === 'ok' && !s.read;
    case 'starred':
      return s.starred;
    case 'spam':
      return s.status === 'spam';
    case 'held':
      return s.status === 'held';
    case 'all':
      return true;
  }
}

/** Unread post among what's loaded. */
export const unreadIn = (items: Submission[]) => items.filter((s) => s.status === 'ok' && !s.read).length;

/** The folder count from GET /api/forms/:id, or null when it doesn't have one. */
export function serverCount(c: FolderCounts | null | undefined, key: Filter): number | null {
  if (!c || key === 'unread') return null;
  return key === 'all' ? c.total : c[key];
}

export interface TabsState {
  filter: Filter;
  hasHeld: boolean;
  flagged: boolean;
  loading: boolean;
  loadError: string;
  appliedQuery: string;
  /** Submissions shown in the open folder. */
  visibleCount: number;
  /** Unread post among everything loaded. */
  unreadLoaded: number;
  hasMore: boolean;
  folderCounts: FolderCounts | null | undefined;
  counts: LocalCounts;
}

/** Held only shows when there is (or might be) held post; its count and every other one prefers the server's number. */
export function folderTabs(st: TabsState): FolderTab[] {
  const keys: Filter[] = ['inbox', 'unread', 'starred', 'spam'];
  if (st.hasHeld || st.flagged || st.filter === 'held') keys.push('held');
  keys.push('all');
  const more = st.hasMore ? '+' : '';
  return keys.map((key) => {
    let count = '';
    const server = serverCount(st.folderCounts, key);
    const local = st.counts[key];
    const loadedHere = key === st.filter && !st.loading && !st.loadError;
    if (loadedHere && st.appliedQuery) count = `${st.visibleCount}${more}`;
    else if (server !== null) count = String(server);
    else if (key === 'unread' && (st.filter === 'inbox' || st.filter === 'unread') && !st.loading && !st.appliedQuery) count = `${st.unreadLoaded}${more}`;
    else if (loadedHere) count = `${st.visibleCount}${more}`;
    else if (local) count = `${local.n}${local.more ? '+' : ''}`;
    return { key, label: FILTER_LABEL[key], count };
  });
}

/** Arrow keys, Home and End across the folder tabs (wrapping). Null for any other key. */
export function tabKeyTarget(keys: Filter[], current: Filter, key: string): Filter | null {
  const i = keys.indexOf(current);
  let next = -1;
  if (key === 'ArrowRight') next = (i + 1) % keys.length;
  else if (key === 'ArrowLeft') next = (i - 1 + keys.length) % keys.length;
  else if (key === 'Home') next = 0;
  else if (key === 'End') next = keys.length - 1;
  return next === -1 ? null : keys[next];
}

export function emptyCopy(filter: Filter, appliedQuery: string, endpoint: string) {
  if (appliedQuery) {
    return {
      title: 'No matches',
      body: `No ${filter === 'all' ? '' : FILTER_LABEL[filter].toLowerCase() + ' '}submissions match “${appliedQuery}”. Try a name, an email or a word from the message.`,
    };
  }
  switch (filter) {
    case 'unread':
      return { title: 'All caught up', body: 'Nothing unread.' };
    case 'starred':
      return { title: 'Nothing starred', body: 'Star a submission (or press s) to keep it here.' };
    case 'spam':
      return { title: 'No spam', body: 'Anything the spam check catches shows up here.' };
    case 'held':
      return { title: 'Nothing held', body: 'Submissions held by the phishing check show up here for review.' };
    default:
      return { title: 'No submissions yet', body: `When someone submits a form pointed at ${endpoint.replace(/^https?:\/\//, '')}, it shows up here.` };
  }
}

/** The line at the top of the export menu, saying what an export will contain. */
export function exportScopeNote(filter: Filter, appliedQuery: string, folderCounts: FolderCounts | null | undefined) {
  const f = apiFilter(filter);
  if (appliedQuery) return `Exports ${FILTER_LABEL[f]} matching “${appliedQuery}”`;
  const n = serverCount(folderCounts, f);
  return `Exports everything in ${FILTER_LABEL[f]}${filter === 'unread' ? ' (read and unread)' : ''}${n !== null ? ` · ${n.toLocaleString('en-GB')}` : ''}`;
}

/** "1 item", "12+ items found" under the search box. */
export function listMeta(visibleCount: number, hasMore: boolean, appliedQuery: string) {
  return `${visibleCount}${hasMore ? '+' : ''} ${visibleCount === 1 && !hasMore ? 'item' : 'items'}${appliedQuery ? ' found' : ''}`;
}
