import { describe, expect, it } from 'vitest';
import type { Submission } from '../../../lib/api/types';
import { apiFilter, emptyCopy, exportScopeNote, folderTabs, inFilter, listMeta, serverCount, tabKeyTarget, unreadIn, type TabsState } from './folders';

const sub = (over: Partial<Submission> = {}): Submission =>
  ({ id: 's1', status: 'ok', read: false, starred: false, deliveries: [], spamScore: 0, data: {}, special: {}, files: [], ...over }) as Submission;

const counts = { inbox: 12, spam: 3, held: 0, starred: 2, total: 17 };

const state = (over: Partial<TabsState> = {}): TabsState => ({
  filter: 'inbox',
  hasHeld: false,
  flagged: false,
  loading: false,
  loadError: '',
  appliedQuery: '',
  visibleCount: 0,
  unreadLoaded: 0,
  hasMore: false,
  folderCounts: null,
  counts: {},
  ...over,
});

describe('inFilter', () => {
  it('sorts post into folders', () => {
    expect(inFilter(sub(), 'inbox')).toBe(true);
    expect(inFilter(sub({ read: true }), 'unread')).toBe(false);
    expect(inFilter(sub({ status: 'spam' }), 'inbox')).toBe(false);
    expect(inFilter(sub({ status: 'spam' }), 'spam')).toBe(true);
    expect(inFilter(sub({ status: 'held' }), 'held')).toBe(true);
    expect(inFilter(sub({ status: 'spam', starred: true }), 'starred')).toBe(true);
    expect(inFilter(sub({ status: 'held' }), 'all')).toBe(true);
  });

  it('counts only unread inbox post', () => {
    expect(unreadIn([sub(), sub({ read: true }), sub({ status: 'spam' })])).toBe(1);
  });

  it('asks the API for the inbox when showing unread', () => {
    expect(apiFilter('unread')).toBe('inbox');
    expect(apiFilter('spam')).toBe('spam');
  });
});

describe('serverCount', () => {
  it('reads folder counts, with no server number for unread', () => {
    expect(serverCount(counts, 'spam')).toBe(3);
    expect(serverCount(counts, 'all')).toBe(17);
    expect(serverCount(counts, 'unread')).toBeNull();
    expect(serverCount(null, 'inbox')).toBeNull();
  });
});

describe('folderTabs', () => {
  it('hides Held unless there is held post, the form is flagged, or it is open', () => {
    expect(folderTabs(state()).map((t) => t.key)).toEqual(['inbox', 'unread', 'starred', 'spam', 'all']);
    expect(folderTabs(state({ hasHeld: true })).map((t) => t.key)).toContain('held');
    expect(folderTabs(state({ flagged: true })).map((t) => t.key)).toContain('held');
    expect(folderTabs(state({ filter: 'held' })).map((t) => t.key)).toContain('held');
  });

  it('prefers server counts, and counts unread from what is loaded', () => {
    const tabs = folderTabs(state({ folderCounts: counts, unreadLoaded: 4, hasMore: true }));
    expect(Object.fromEntries(tabs.map((t) => [t.key, t.count]))).toEqual({ inbox: '12', unread: '4+', starred: '2', spam: '3', all: '17' });
  });

  it('shows search results for the open folder', () => {
    const tabs = folderTabs(state({ folderCounts: counts, appliedQuery: 'ada', visibleCount: 2 }));
    expect(tabs[0].count).toBe('2');
    expect(tabs[1].count).toBe('');
  });

  it('falls back to what this browser counted, and shows nothing while loading', () => {
    const tabs = folderTabs(state({ filter: 'spam', loading: true, counts: { starred: { n: 5, more: true } } }));
    expect(tabs.find((t) => t.key === 'starred')!.count).toBe('5+');
    expect(tabs.find((t) => t.key === 'spam')!.count).toBe('');
    expect(tabs.find((t) => t.key === 'unread')!.count).toBe('');
  });

  it('counts the open folder once it has loaded', () => {
    const tabs = folderTabs(state({ filter: 'spam', visibleCount: 7 }));
    expect(tabs.find((t) => t.key === 'spam')!.count).toBe('7');
  });
});

describe('tabKeyTarget', () => {
  const keys = ['inbox', 'unread', 'spam'] as const;
  it('wraps with the arrows and jumps with Home and End', () => {
    expect(tabKeyTarget([...keys], 'spam', 'ArrowRight')).toBe('inbox');
    expect(tabKeyTarget([...keys], 'inbox', 'ArrowLeft')).toBe('spam');
    expect(tabKeyTarget([...keys], 'unread', 'Home')).toBe('inbox');
    expect(tabKeyTarget([...keys], 'unread', 'End')).toBe('spam');
    expect(tabKeyTarget([...keys], 'unread', 'Enter')).toBeNull();
  });
});

describe('copy', () => {
  it('explains empty folders and empty searches', () => {
    expect(emptyCopy('inbox', '', 'https://sendm8.com/f/abc').body).toContain('sendm8.com/f/abc, it lands here');
    expect(emptyCopy('spam', 'ada', '').body).toBe('No spam post matches “ada”. Try a name, an email or a word from the message.');
    expect(emptyCopy('all', 'ada', '').body.startsWith('No post matches')).toBe(true);
    expect(emptyCopy('unread', '', '').title).toBe('All caught up.');
  });

  it('says what an export will contain', () => {
    expect(exportScopeNote('unread', '', counts)).toBe('Exports everything in Inbox (read and unread) · 12');
    expect(exportScopeNote('spam', 'ada', counts)).toBe('Exports Spam matching “ada”');
    expect(exportScopeNote('all', '', null)).toBe('Exports everything in All');
  });

  it('counts items under the search box', () => {
    expect(listMeta(1, false, '')).toBe('1 item');
    expect(listMeta(1, true, '')).toBe('1+ items');
    expect(listMeta(3, false, 'ada')).toBe('3 items found');
  });
});
