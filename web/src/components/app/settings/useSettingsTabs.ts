import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { nextTabIndex, tabFromHash, tabs, type TabId } from './settingsTabs';

/** The selected settings tab, kept in step with the URL hash. */
export function useSettingsTabs() {
  const tab = ref<TabId>('general');

  function selectTab(id: TabId, focus = false) {
    tab.value = id;
    if (typeof window !== 'undefined' && location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    if (focus) nextTick(() => document.getElementById(`fs-tab-${id}`)?.focus());
  }

  function onTabKey(e: KeyboardEvent) {
    const n = nextTabIndex(
      e.key,
      tabs.findIndex((t) => t.id === tab.value),
      tabs.length,
    );
    if (n === null) return;
    e.preventDefault();
    selectTab(tabs[n].id, true);
  }

  function fromHash() {
    const t = tabFromHash(location.hash);
    if (t) tab.value = t;
  }

  onMounted(() => {
    fromHash();
    window.addEventListener('hashchange', fromHash);
  });
  onBeforeUnmount(() => window.removeEventListener('hashchange', fromHash));

  return { tabs, tab, selectTab, onTabKey };
}
