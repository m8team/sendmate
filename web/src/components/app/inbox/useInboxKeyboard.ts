/**
 * Inbox shortcuts: j/k (and arrows in the list) move, Enter opens, s stars, x picks,
 * / searches, Escape backs out. Ignored while typing, in popovers or with the rail open.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import type { Submission } from '../../../lib/api/types';
import type { InboxNav } from './useInboxNav';
import type { Submissions } from './useSubmissions';

export interface KeyboardDeps {
  list: Submissions;
  nav: InboxNav;
  toggleStar: (s: Submission) => void;
  toggleSelect: (id: string) => void;
  searchEl: () => HTMLInputElement | null | undefined;
  listEl: () => HTMLElement | null | undefined;
}

export function useInboxKeyboard({ list, nav, toggleStar, toggleSelect, searchEl, listEl }: KeyboardDeps) {
  const { query, selected, activeId, openId, visibleIds, byId } = list;

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.documentElement.classList.contains('rail-is-open')) return;
    const t = e.target as HTMLElement;
    if (t.closest('[popover]')) return;
    const search = searchEl();
    const typing = t.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]');
    if (typing) {
      if (e.key === 'Escape' && t === search) {
        if (query.value) query.value = '';
        else search?.blur();
      }
      if (e.key === 'ArrowDown' && t === search && visibleIds.value.length) {
        e.preventDefault();
        nav.move(1);
      }
      return;
    }
    const inList = !!listEl()?.contains(t);
    const key = e.key;
    if (key === 'j' || (key === 'ArrowDown' && inList)) {
      e.preventDefault();
      nav.move(1, nav.mobileOpen.value);
    } else if (key === 'k' || (key === 'ArrowUp' && inList)) {
      e.preventDefault();
      nav.move(-1, nav.mobileOpen.value);
    } else if (key === 's') {
      const id = inList ? activeId.value : (openId.value ?? activeId.value);
      const s = id ? byId(id) : null;
      if (s) {
        e.preventDefault();
        toggleStar(s);
      }
    } else if (key === 'x' && inList && activeId.value) {
      e.preventDefault();
      toggleSelect(activeId.value);
    } else if (key === '/') {
      e.preventDefault();
      if (nav.mobileOpen.value) nav.closeMobile();
      search?.focus();
    } else if (key === 'Enter' && (t === document.body || t.id === 'main') && activeId.value) {
      e.preventDefault();
      nav.open(activeId.value);
    } else if (key === 'Escape') {
      if (nav.mobileOpen.value) nav.closeMobile();
      else if (selected.value.length) selected.value = [];
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
}
