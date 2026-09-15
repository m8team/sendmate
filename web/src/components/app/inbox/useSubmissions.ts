/**
 * The inbox's post: which folder is open, what's loaded, what's picked and what's open,
 * plus folder counts and the unread number shared with the sidebar.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { SubmissionDto } from '@sendm8/shared';
import type { Channel, Form, Submission } from '../../../lib/api/types';
import { api } from '../../../lib/api/endpoints';
import { toForm, toSubmission } from '../../../lib/api/adapters';
import { friendlyError } from '../../../lib/api/errors';
import { getUnreadCache, markRead, readIds, setUnreadCache } from '../../../lib/api/readState';
import { announceUnread } from '../../../lib/api/store';
import { toast } from '../../../lib/toast';
import { apiFilter, folderTabs, inFilter, unreadIn, type Filter, type LocalCounts } from './folders';
import { isMobile } from './media';

const PAGE_SIZE = 50;

export interface InboxSource {
  form: Form;
  channels: Channel[];
}

export function useSubmissions(props: InboxSource, onFormUpdated: (form: Form) => void) {
  const items = ref<Submission[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(true);
  const loadingMore = ref(false);
  const loadError = ref('');
  const filter = ref<Filter>('inbox');
  const query = ref('');
  const appliedQuery = ref('');
  const selected = ref<string[]>([]);
  const hasHeld = ref(false);
  const counts = ref<LocalCounts>({});
  const openId = ref<string | null>(null);
  const activeId = ref<string | null>(null);
  let requestSeq = 0;

  const visible = computed(() => items.value.filter((s) => inFilter(s, filter.value)));
  const visibleIds = computed(() => visible.value.map((s) => s.id));
  const byId = (id: string) => items.value.find((s) => s.id === id);

  /* ---- Folder counts from GET /api/forms/:id, refreshed after changes ---- */
  const folderCounts = ref(props.form.counts);
  let countsTimer = 0;
  function refreshCounts() {
    window.clearTimeout(countsTimer);
    countsTimer = window.setTimeout(async () => {
      try {
        const dto = await api.getForm(props.form.id);
        folderCounts.value = dto.counts ?? null;
        onFormUpdated(toForm(dto, props.form.daily));
      } catch {
        /* counts are a nicety */
      }
    }, 500);
  }

  const tabs = computed(() =>
    folderTabs({
      filter: filter.value,
      hasHeld: hasHeld.value,
      flagged: !!props.form.flag,
      loading: loading.value,
      loadError: loadError.value,
      appliedQuery: appliedQuery.value,
      visibleCount: visible.value.length,
      unreadLoaded: unreadIn(items.value),
      hasMore: !!nextCursor.value,
      folderCounts: folderCounts.value,
      counts: counts.value,
    }),
  );

  /* ---- Loading ----------------------------------------------------------- */
  async function load(reset = true) {
    const seq = ++requestSeq;
    if (reset) {
      loading.value = true;
      loadError.value = '';
      selected.value = [];
    } else {
      if (!nextCursor.value || loadingMore.value) return;
      loadingMore.value = true;
    }
    try {
      const page = await api.listSubmissions(props.form.id, {
        filter: apiFilter(filter.value),
        q: appliedQuery.value,
        cursor: reset ? null : nextCursor.value,
        limit: PAGE_SIZE,
      });
      if (seq !== requestSeq) return;
      const read = readIds(props.form.id);
      const fresh = page.data.map((d) => toSubmission(d, props.channels, read.has(d.id)));
      if (reset) {
        items.value = fresh;
      } else {
        const have = new Set(items.value.map((s) => s.id));
        items.value = [...items.value, ...fresh.filter((s) => !have.has(s.id))];
      }
      nextCursor.value = page.nextCursor;
      if (filter.value === 'held' && items.value.length) hasHeld.value = true;
      if (!appliedQuery.value) counts.value = { ...counts.value, [filter.value]: { n: visible.value.length, more: page.nextCursor !== null } };
      syncUnread();
      if (reset && !isMobile() && (!openId.value || !byId(openId.value))) {
        openId.value = visibleIds.value[0] ?? null;
        activeId.value = openId.value;
      }
    } catch (err) {
      if (seq !== requestSeq) return;
      if (reset) {
        loadError.value = friendlyError(err);
        items.value = [];
        nextCursor.value = null;
      } else {
        toast(`Couldn’t load more: ${friendlyError(err)}`);
      }
    } finally {
      if (seq === requestSeq) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  async function probeHeld() {
    if (folderCounts.value) {
      hasHeld.value = folderCounts.value.held > 0;
      return;
    }
    try {
      const page = await api.listSubmissions(props.form.id, { filter: 'held', limit: 1 });
      hasHeld.value = page.data.length > 0;
    } catch {
      /* the tab still appears when the form is flagged */
    }
  }

  function replaceItem(dto: SubmissionDto) {
    const i = items.value.findIndex((x) => x.id === dto.id);
    if (i >= 0) items.value[i] = toSubmission(dto, props.channels, items.value[i].read);
  }
  async function refreshItem(id: string) {
    try {
      replaceItem(await api.getSubmission(id));
    } catch {
      /* it'll be right on the next load */
    }
  }

  /* ---- Unread counts (shared with the sidebar) --------------------------- */
  function publishUnread(count: number, more: boolean) {
    setUnreadCache(props.form.id, { last: props.form.lastReceivedAt, count, more });
    announceUnread(props.form.id, count, more);
  }
  const showsInbox = () => (filter.value === 'inbox' || filter.value === 'unread') && !appliedQuery.value;
  /** After anything that loads or changes post: other folders' counts may be stale now, so only the open one keeps its number. */
  function syncUnread() {
    counts.value = appliedQuery.value || loadError.value ? {} : { [filter.value]: { n: visible.value.length, more: nextCursor.value !== null } };
    if (showsInbox()) publishUnread(unreadIn(items.value), nextCursor.value !== null);
  }
  function noteRead(subs: Submission[]) {
    const fresh = subs.filter((s) => !s.read);
    if (!fresh.length) return;
    fresh.forEach((s) => (s.read = true));
    markRead(
      props.form.id,
      fresh.map((s) => s.id),
    );
    if (showsInbox()) return syncUnread();
    const cache = getUnreadCache(props.form.id);
    const n = fresh.filter((s) => s.status === 'ok').length;
    if (cache && n) publishUnread(Math.max(0, cache.count - n), cache.more);
  }

  /* ---- Folder & search changes reload ------------------------------------ */
  watch(filter, (f, old) => {
    // Unread is a view of the inbox we already have.
    if ((f === 'unread' && old === 'inbox') || (f === 'inbox' && old === 'unread')) return;
    load();
  });
  let searchTimer = 0;
  watch(query, (q) => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      if (q.trim() === appliedQuery.value) return;
      appliedQuery.value = q.trim();
      load();
    }, 300);
  });
  onBeforeUnmount(() => window.clearTimeout(searchTimer));

  return {
    items,
    nextCursor,
    loading,
    loadingMore,
    loadError,
    filter,
    query,
    appliedQuery,
    selected,
    hasHeld,
    folderCounts,
    openId,
    activeId,
    visible,
    visibleIds,
    tabs,
    byId,
    load,
    probeHeld,
    refreshCounts,
    replaceItem,
    refreshItem,
    syncUnread,
    noteRead,
  };
}

export type Submissions = ReturnType<typeof useSubmissions>;
