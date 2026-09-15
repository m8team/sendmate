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
  scroll-margin-top: 5.5rem;
  border: 1px solid var(--line);
  background: var(--bg);
}
.step.is-current {
  border: var(--bw-strong) solid var(--line-strong);
  background: var(--bg-raised);
  box-shadow: var(--shadow-label);
}
.step.is-todo {
  border-style: dashed;
}
.step-head {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
}
.step-no {
  flex: none;
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: 2.6rem;
  line-height: 0.8;
  width: 1.6rem;
  color: var(--fg-subtle);
}
.step.is-current .step-no {
  color: var(--signal);
}
.step.is-done .step-no {
  color: var(--fg);
}
.step-head-text {
  flex: 1;
  min-width: 0;
}
.step-title {
  font-family: var(--font-display);
  font-stretch: var(--stretch-semi);
  font-weight: 800;
  font-size: clamp(1.25rem, 2vw, 1.55rem);
  line-height: 1.1;
}
.step.is-todo .step-title {
  color: var(--fg-muted);
}
.step-title:focus {
  outline: none;
}
.step-title:focus-visible {
  outline: none;
  box-shadow: none;
}
.step-summary {
  margin-top: 0.15rem;
  font-size: var(--fs-sm);
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The step's own form, passed in through the slot */
:slotted(.step-body) {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-2) var(--s-5) var(--s-5);
  border-top: 2px dashed var(--line);
  padding-top: var(--s-5);
}
:slotted(.step-intro) {
  font-size: var(--fs-sm);
  color: var(--fg-muted);
  max-width: 60ch;
}
:slotted(.step-actions) {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-2);
}

@media (max-width: 560px) {
  .step-head {
    padding: var(--s-3) var(--s-4);
    gap: var(--s-3);
  }
  :slotted(.step-body) {
    padding: var(--s-4);
  }
  :slotted(.step-actions .btn) {
    flex: 1;
  }
  :slotted(.step-actions .btn-ghost) {
    flex: 0 0 auto;
  }
}
</style>
