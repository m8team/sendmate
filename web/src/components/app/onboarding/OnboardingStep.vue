<script setup lang="ts">
import type { Step } from './onboardingLogic';
import { useOnboarding } from './useOnboarding';

/**
 * The card each onboarding step sits in: the big number, the title, a one-line summary once the
 * step is behind you, and an Edit/Open button. The step's form goes in the slot, as `.step-body`.
 */
defineProps<{
  n: Step;
  heading: string;
  /** Shown under the heading when set. */
  summary?: string;
  /** The header button, e.g. { label: 'Edit', srLabel: 'name' }. Hidden when not set. */
  action?: { label: string; srLabel: string };
}>();
const emit = defineEmits<{ action: [] }>();

const { stepState } = useOnboarding();
</script>

<template>
  <section class="step" :class="`is-${stepState(n)}`" :aria-labelledby="`ob-step-${n}-title`">
    <header class="step-head">
      <span class="step-no" aria-hidden="true">{{ n }}</span>
      <div class="step-head-text">
        <h2 :id="`ob-step-${n}-title`" class="step-title" tabindex="-1">{{ heading }}</h2>
        <p v-if="summary" class="step-summary">{{ summary }}</p>
      </div>
      <button v-if="action" type="button" class="btn btn-ghost btn-xs" @click="emit('action')">
        {{ action.label }}<span class="sr-only">{{ ` ${action.srLabel}` }}</span>
      </button>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.step {
  scroll-margin-top: 4.5rem;
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  background: var(--bg);
}
.step.is-current {
  border-color: color-mix(in srgb, var(--fg) 30%, transparent);
}
.step-head {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
}
.step-no {
  flex: none;
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--bg-sunk);
  font-size: var(--fs-2xs);
  font-weight: 600;
  color: var(--fg-muted);
}
.step.is-current .step-no {
  background: var(--fg);
  color: var(--bg);
}
.step.is-done .step-no {
  background: var(--ok-wash);
  color: var(--ok);
}
.step-head-text {
  flex: 1;
  min-width: 0;
}
.step-title {
  font-size: var(--fs-sm);
  font-weight: 600;
  line-height: 1.4;
}
.step.is-todo .step-title {
  color: var(--fg-muted);
}
.step-title:focus,
.step-title:focus-visible {
  outline: none;
  box-shadow: none;
}
.step-summary {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The step's own form, passed in through the slot */
:slotted(.step-body) {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-4);
  border-top: 1px solid var(--line);
}
:slotted(.step-intro) {
  color: var(--fg-muted);
  max-width: 60ch;
}
:slotted(.step-actions) {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--s-2);
}

@media (max-width: 560px) {
  :slotted(.step-body) {
    padding: var(--s-3);
  }
  :slotted(.step-actions .btn) {
    flex: 1;
  }
  :slotted(.step-actions .btn-ghost) {
    flex: 0 0 auto;
  }
}
</style>
