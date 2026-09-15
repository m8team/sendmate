<script setup lang="ts">
/** The window chrome around the mock email client and the mock Discord channel. */
defineProps<{
  kind: 'email' | 'discord';
  /** On narrow screens only the active window shows, behind the tabs. */
  active: boolean;
  /** Accessible name for the region. */
  label: string;
  /** The small "Your email" / "Your Discord" tag on the right of the bar. */
  owner: string;
}>();
</script>

<template>
  <section class="out" :class="[`out-${kind}`, { active }]" :aria-label="label">
    <header class="out-bar" :class="{ 'out-bar-discord': kind === 'discord' }">
      <span v-if="kind === 'email'" class="out-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span v-else class="dc-hash" aria-hidden="true">#</span>
      <span class="out-title"><slot name="title" /></span>
      <span class="label out-kind">{{ owner }}</span>
    </header>
    <slot />
  </section>
</template>

<style scoped>
.out {
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  background: var(--bg-raised);
  min-height: 17rem;
}
.out-bar {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 0.55rem 0.8rem;
  border-bottom: 1px solid var(--line);
}
.out-dots {
  display: flex;
  gap: 5px;
}
.out-dots i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid var(--fg-muted);
}
.out-title {
  font-weight: 600;
  font-size: var(--fs-sm);
}
.out-kind {
  margin-left: auto;
  color: var(--fg-muted);
}

/* discord-ish */
.out-bar-discord {
  background: #2b2d31;
  color: #f2f3f5;
  border-bottom-color: #1f2023;
}
.out-bar-discord .out-kind {
  color: #a5a8ae;
}
.dc-hash {
  font-size: 1.3rem;
  line-height: 1;
  color: #80848e;
}

@media (max-width: 760px) {
  .out {
    display: none;
  }
  .out.active {
    display: flex;
  }
}
</style>
