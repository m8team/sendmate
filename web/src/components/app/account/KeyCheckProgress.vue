<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { keyChecks } from './resendRules';

/** The checklist that ticks along while Resend checks a key. `step` is the check in progress. */
defineProps<{ step: number }>();
</script>

<template>
  <div class="checking" role="status" aria-live="polite">
    <p class="checking-title mono">Checking with Resend…</p>
    <ol class="checklist" role="list">
      <li v-for="c in keyChecks" :key="c.n" :class="{ done: step > c.n, now: step === c.n }">
        <span class="checklist-mark" aria-hidden="true">
          <Icon v-if="step > c.n" name="check" :size="14" :stroke-width="2.5" />
          <span v-else-if="step === c.n" class="dot"></span>
        </span>
        {{ c.text }}<span class="sr-only">{{ step > c.n ? ' (done)' : step === c.n ? ' (in progress)' : '' }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.checking {
  padding: var(--s-4);
  border: 1.5px solid var(--line-strong);
  background: var(--bg);
}
.checking-title {
  font-size: var(--fs-sm);
  font-weight: 600;
}
.checking-title::after {
  content: '';
  display: block;
  height: 3px;
  margin-top: var(--s-2);
  background: repeating-linear-gradient(90deg, var(--signal) 0 10px, transparent 10px 16px);
  background-size: 32px 3px;
  animation: conveyor 700ms linear infinite;
}
@keyframes conveyor {
  to {
    background-position: 32px 0;
  }
}
.checklist {
  display: grid;
  gap: 0.35rem;
  margin-top: var(--s-3);
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}
.checklist li {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
.checklist li.done,
.checklist li.now {
  color: var(--fg);
}
.checklist-mark {
  display: grid;
  place-items: center;
  width: 1.2rem;
  height: 1.2rem;
  border: 1.5px solid var(--line);
  border-radius: 50%;
}
.checklist li.done .checklist-mark {
  background: var(--ok);
  border-color: var(--ok);
  color: var(--bg);
}
.checklist li.now .checklist-mark {
  border-color: var(--signal);
}
.dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--signal);
  animation: pulse 900ms ease-in-out infinite alternate;
}
@keyframes pulse {
  to {
    opacity: 0.25;
  }
}
</style>
