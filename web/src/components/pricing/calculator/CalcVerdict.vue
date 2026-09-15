<script setup lang="ts">
import type { Verdict } from './calcLogic';

defineProps<{ verdict: Verdict }>();
</script>

<template>
  <div class="verdict" :class="`tone-${verdict.tone}`" aria-live="polite" aria-atomic="true">
    <span class="stamp verdict-stamp" :class="{ 'stamp-ok': verdict.tone === 'ok', 'stamp-warn': verdict.tone === 'warn', 'stamp-ink': verdict.tone === 'idle' }" :key="verdict.stamp">
      {{ verdict.stamp }}
    </span>
    <p class="verdict-head">{{ verdict.head }}</p>
    <p class="verdict-body">{{ verdict.body }}</p>
  </div>
</template>

<style scoped>
.verdict {
  position: relative;
  padding-top: var(--s-2);
  min-height: 13rem;
}
.verdict-stamp {
  --stamp-rotate: -4deg;
  font-size: var(--fs-sm);
  animation: thunk var(--dur-3) var(--ease-thunk);
}
@keyframes thunk {
  from {
    transform: scale(1.8) rotate(-12deg);
    opacity: 0;
  }
}
.verdict-head {
  margin-top: var(--s-4);
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(2.1rem, 4vw, 3.4rem);
  line-height: 0.92;
  letter-spacing: -0.005em;
  text-wrap: balance;
}
.tone-signal .verdict-head {
  color: var(--signal-text);
}
.verdict-body {
  margin-top: var(--s-3);
  max-width: 54ch;
  color: var(--fg-muted);
}

@media (max-width: 960px) {
  .verdict {
    min-height: 0;
  }
}
</style>
