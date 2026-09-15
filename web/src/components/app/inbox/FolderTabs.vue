<script setup lang="ts">
/** Inbox / Unread / Starred / Spam / Held / All, as ARIA tabs with arrow keys, Home and End. */
import { tabKeyTarget, type Filter, type FolderTab } from './folders';

const props = defineProps<{ tabs: FolderTab[]; filter: Filter }>();
/** `focus` is true when the keyboard moved, so the new tab should take focus. */
const emit = defineEmits<{ select: [key: Filter, focus: boolean] }>();

function onKey(e: KeyboardEvent) {
  const next = tabKeyTarget(
    props.tabs.map((t) => t.key),
    props.filter,
    e.key,
  );
  if (!next) return;
  e.preventDefault();
  emit('select', next, true);
}
</script>

<template>
  <div class="tabs" role="tablist" aria-label="Filter submissions" @keydown="onKey">
    <button
      v-for="t in tabs"
      :id="`tab-${t.key}`"
      :key="t.key"
      type="button"
      role="tab"
      class="tab"
      :aria-selected="filter === t.key"
      :tabindex="filter === t.key ? 0 : -1"
      aria-controls="inbox-rows"
      @click="emit('select', t.key, false)"
    >
      {{ t.label }} <span v-if="t.count" class="tab-n mono">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.45rem;
  border: 1px solid transparent;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--fg-muted);
  font-size: 0.875rem;
  font-weight: 600;
}
.tab:hover {
  color: var(--fg);
  border-color: var(--line);
}
.tab[aria-selected='true'] {
  background: var(--fg);
  color: var(--bg);
}
.tab-n {
  font-size: var(--fs-2xs);
  font-weight: 500;
  opacity: 0.8;
}
</style>
