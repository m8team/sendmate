<script setup lang="ts">
/** A cheat sheet for the shortcuts useInboxKeyboard handles. Hidden on touch screens. */
</script>

<template>
  <p class="keys" aria-hidden="true">
    <span><kbd class="kbd">j</kbd><kbd class="kbd">k</kbd> move</span>
    <span><kbd class="kbd">↵</kbd> open</span>
    <span><kbd class="kbd">s</kbd> star</span>
    <span><kbd class="kbd">x</kbd> pick</span>
    <span><kbd class="kbd">/</kbd> search</span>
  </p>
</template>

<style scoped>
.keys {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.8rem;
  padding: 0.55rem var(--s-3);
  border-top: 1px solid var(--line);
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
}
.keys .kbd {
  margin-right: 0.15rem;
  color: var(--fg);
  font-size: 0.65rem;
}
@media (pointer: coarse) {
  .keys {
    display: none;
  }
}
@media (max-width: 720px) {
  .keys {
    display: none;
  }
}
</style>
