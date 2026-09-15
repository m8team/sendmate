/**
 * Moving through the inbox: opening a submission, j/k movement, roving focus in the list,
 * and the mobile detail sheet (which gets a history entry so Back closes it).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { MOBILE_QUERY, isMobile } from './media';
import { stepIndex } from './rows';
import type { Submissions } from './useSubmissions';

export function useInboxNav(list: Submissions, els: { list: () => HTMLElement | null; detail: Ref<HTMLElement | null> }) {
  const { items, openId, activeId, visibleIds, byId, noteRead } = list;
  const mobileOpen = ref(false);
  const releasedId = ref<string | null>(null);

  const current = computed(() => items.value.find((s) => s.id === openId.value) ?? null);
  const openIndex = computed(() => (openId.value ? visibleIds.value.indexOf(openId.value) : -1));
  /** The one row reachable with Tab: the active one, or the first. */
  const tabStopId = computed(() => (activeId.value && visibleIds.value.includes(activeId.value) ? activeId.value : visibleIds.value[0]));

  function focusRow(id: string) {
    nextTick(() => {
      const el = els.list()?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .row-main`);
      el?.focus();
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  function open(id: string, opts: { focusDetail?: boolean } = {}) {
    const s = byId(id);
    if (!s) return;
    openId.value = id;
    activeId.value = id;
    noteRead([s]);
    if (releasedId.value !== id) releasedId.value = null;
    if (els.detail.value) els.detail.value.scrollTop = 0;
    if (isMobile()) {
      if (!mobileOpen.value) {
        mobileOpen.value = true;
        history.pushState({ sendm8Inbox: id }, '');
      }
      nextTick(() => document.getElementById(`det-h-${id}`)?.focus({ preventScroll: true }));
    } else if (opts.focusDetail) {
      nextTick(() => document.getElementById(`det-h-${id}`)?.focus());
    }
  }

  function closeMobile(fromPop = false) {
    if (!mobileOpen.value) return;
    mobileOpen.value = false;
    if (!fromPop && history.state?.sendm8Inbox) history.back();
    if (openId.value) focusRow(openId.value);
  }

  function move(delta: number, openIt = false) {
    const ids = visibleIds.value;
    const next = stepIndex(ids, activeId.value, delta);
    if (next === -1) return;
    activeId.value = ids[next];
    if (openIt) open(ids[next]);
    else focusRow(ids[next]);
  }

  /** Newer / older from the mobile detail bar. */
  function flick(delta: number) {
    const target = visibleIds.value[openIndex.value + delta];
    if (target) open(target);
  }

  function onPop() {
    if (mobileOpen.value) closeMobile(true);
  }
  const mq = typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY) : null;
  function onMq() {
    if (!mq?.matches && mobileOpen.value) mobileOpen.value = false;
  }

  watch(mobileOpen, (on) => {
    document.documentElement.classList.toggle('inbox-detail-open', on);
  });
  onMounted(() => {
    window.addEventListener('popstate', onPop);
    mq?.addEventListener('change', onMq);
  });
  onBeforeUnmount(() => {
    window.removeEventListener('popstate', onPop);
    mq?.removeEventListener('change', onMq);
    document.documentElement.classList.remove('inbox-detail-open');
  });

  return { mobileOpen, releasedId, current, openIndex, tabStopId, focusRow, open, closeMobile, move, flick };
}

export type InboxNav = ReturnType<typeof useInboxNav>;
