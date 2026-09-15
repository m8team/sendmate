<script setup lang="ts">
import { useFormSettings } from './useFormSettings';

const { tabs, tab, selectTab, onTabKey, tabHasError, chans } = useFormSettings();
</script>

<template>
  <div class="fs-tabs" role="tablist" aria-label="Form settings" aria-orientation="vertical">
    <button
      v-for="(t, i) in tabs"
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
      <span class="fs-tab-no mono" aria-hidden="true">0{{ i + 1 }}</span>
      <span class="fs-tab-label">{{ t.label }}</span>
      <span v-if="t.id === 'channels'" class="fs-tab-count mono" :aria-label="`${chans.length} channels`">{{ chans.length }}</span>
      <span v-if="tabHasError(t.id)" class="fs-tab-err" aria-hidden="true">!</span><span v-if="tabHasError(t.id)" class="sr-only">(has an error)</span>
    </button>
  </div>
</template>

<style scoped>
/* Index-card dividers */
.fs-tabs {
  position: sticky;
  top: 5rem;
  display: grid;
  gap: 2px;
  border-top: var(--bw-strong) solid var(--line-strong);
  padding-top: var(--s-2);
}
.fs-tab {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  width: 100%;
  padding: 0.6rem 0.65rem;
  border: 1px solid transparent;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--fg-muted);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-align: left;
}
.fs-tab:hover {
  color: var(--fg);
  border-color: var(--line);
}
.fs-tab[aria-selected='true'] {
  background: var(--fg);
  color: var(--bg);
  border-color: var(--fg);
}
.fs-tab-no {
  font-size: var(--fs-2xs);
  opacity: 0.75;
}
.fs-tab-label {
  flex: 1;
}
.fs-tab-count {
  min-width: 1.4rem;
  padding: 0 0.3rem;
  border: 1px solid currentColor;
  font-size: var(--fs-2xs);
  text-align: center;
  line-height: 1.3rem;
}
.fs-tab-err {
  display: grid;
  place-items: center;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  background: var(--signal);
  color: var(--on-signal);
  font-size: var(--fs-2xs);
  font-weight: 800;
}
.fs-tab.is-danger:not([aria-selected='true']) {
  color: var(--signal-text);
}
.fs-tab.is-danger[aria-selected='true'] {
  background: var(--signal);
  border-color: var(--signal);
  color: var(--on-signal);
}

@media (max-width: 860px) {
  .fs-tabs {
    position: sticky;
    top: 3.75rem;
    z-index: 20;
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    margin-inline: calc(clamp(1rem, 2.5vw, 2rem) * -1);
    padding: var(--s-2) clamp(1rem, 2.5vw, 2rem);
    border-top: 0;
    border-bottom: 1px solid var(--line);
    background: color-mix(in srgb, var(--bg) 95%, transparent);
    backdrop-filter: blur(6px);
  }
  .fs-tabs::-webkit-scrollbar {
    display: none;
  }
  .fs-tab {
    flex: none;
    width: auto;
  }
  .fs-tab-no {
    display: none;
  }
}
</style>
