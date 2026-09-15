/**
 * Delete with undo: post leaves the list straight away, but the API call waits until the
 * undo window closes (or goes out with keepalive when the page is left).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { Submission } from '../../../lib/api/types';
import { bulkAll } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { toast } from '../../../lib/toast';
import { sender } from '../InboxUtils';
import { isMobile } from './media';
import { byNewest } from './rows';
import type { InboxNav } from './useInboxNav';
import type { Submissions } from './useSubmissions';

const UNDO_MS = 6000;

export function useUndoDelete(list: Submissions, nav: InboxNav, formId: () => string) {
  const { items, selected, openId, activeId, visibleIds, syncUnread, refreshCounts } = list;
  const undo = ref<{ label: string } | null>(null);
  let pending: { ids: string[]; removed: Submission[] } | null = null;
  let undoTimer = 0;

  function remove(ids: string[]) {
    const removed = items.value.filter((s) => ids.includes(s.id));
    if (!removed.length) return;
    void commitDelete();
    const wasOpen = openId.value && ids.includes(openId.value);
    const idx = nav.openIndex.value;
    items.value = items.value.filter((s) => !ids.includes(s.id));
    selected.value = selected.value.filter((id) => !ids.includes(id));
    pending = { ids: removed.map((s) => s.id), removed };
    undo.value = { label: removed.length === 1 ? `Deleted ${sender(removed[0])}.` : `Deleted ${removed.length}.` };
    window.clearTimeout(undoTimer);
    undoTimer = window.setTimeout(() => void commitDelete(), UNDO_MS);
    syncUnread();
    if (wasOpen) {
      const left = visibleIds.value;
      const next = left[Math.min(Math.max(idx, 0), left.length - 1)] ?? null;
      if (nav.mobileOpen.value) nav.closeMobile();
      openId.value = next;
      activeId.value = next;
      if (next && !isMobile()) nav.focusRow(next);
    }
  }

  async function commitDelete(keepalive = false) {
    const job = pending;
    if (!job) return;
    pending = null;
    window.clearTimeout(undoTimer);
    undo.value = null;
    try {
      await bulkAll(formId(), job.ids, 'delete', { keepalive });
      if (!keepalive) refreshCounts();
    } catch (err) {
      const have = new Set(items.value.map((s) => s.id));
      items.value = [...items.value, ...job.removed.filter((s) => !have.has(s.id))].sort(byNewest);
      syncUnread();
      toast(`Couldn’t delete: ${friendlyError(err)}`);
    }
  }

  function undoDelete() {
    if (!pending) return;
    const back = pending.removed;
    pending = null;
    window.clearTimeout(undoTimer);
    undo.value = null;
    items.value = [...items.value, ...back].sort(byNewest);
    syncUnread();
    if (back.length === 1) {
      openId.value = back[0].id;
      activeId.value = back[0].id;
    }
    toast(back.length === 1 ? 'Back in the pigeonhole' : `${back.length} back in the pigeonhole`);
  }

  function onPageHide() {
    void commitDelete(true);
  }
  onMounted(() => window.addEventListener('pagehide', onPageHide));
  onBeforeUnmount(() => {
    window.removeEventListener('pagehide', onPageHide);
    void commitDelete(true);
  });

  return { undo, remove, commitDelete, undoDelete };
}
