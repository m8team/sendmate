<script setup lang="ts">
import { useFormSettings } from './useFormSettings';

const { tabs, tab, selectTab, onTabKey, tabHasError, chans } = useFormSettings();
</script>

<template>
  <div class="fs-tabs" role="tablist" aria-label="Form settings">
    <button
      v-for="t in tabs"
      :id="`fs-tab-${t.id}`"
      :key="t.id"
      type="button"
      role="tab"
      class="fs-tab"
      :class="{ 'is-danger': t.id === 'danger' }"
      :aria-selected="tab === t.id"
      :aria-controls="`fs-panel-${t.id}`"
      :tabindex="tab === t.id ? 0 : -1"
      @click="selectTab(t.id)"
      @keydown="onTabKey"
    >
      <span class="fs-tab-label">{{ t.label }}</span>
       <span v-if="t.id === 'channels'" class="fs-tab-count" :aria-label="`${chans.length} channels`">{{ chans.length }}</span>
      <span v-if="tabHasError(t.id)" class="fs-tab-err" aria-hidden="true">!</span><span v-if="tabHasError(t.id)" class="sr-only">(has an error)</span>
    </button>
  </div>
</template>

<style scoped>
.fs-tabs {
  display: flex;
  gap: var(--s-5);
  border-bottom: 1px solid var(--line);
  overflow-x: auto;
  scrollbar-width: none;
}
.fs-tabs::-webkit-scrollbar {
  display: none;
}
.fs-tab {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  margin-bottom: -1px;
  padding: var(--s-2) 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--fg-muted);
  font-size: var(--fs-sm);
  font-weight: 500;
}
.fs-tab:hover {
  color: var(--fg);
}
.fs-tab[aria-selected='true'] {
  color: var(--fg);
  font-weight: 600;
  border-bottom-color: var(--fg);
}
.fs-tab-count {
  font-size: var(--fs-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--fg-muted);
}
.fs-tab-err {
  display: inline-grid;
  place-items: center;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: var(--signal);
  color: var(--on-signal);
  font-size: 0.6875rem;
  font-weight: 700;
}
.fs-tab.is-danger {
  margin-left: auto;
}
.fs-tab.is-danger[aria-selected='true'] {
  color: var(--signal-text);
  border-bottom-color: var(--signal);
}
</style>
