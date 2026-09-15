<script setup lang="ts">
/** "Deleted Ada." with Undo, pinned to the bottom of the list while the undo window is open. */
import Icon from '../../ui/Icon.vue';

defineProps<{ label: string }>();
const emit = defineEmits<{ undo: []; dismiss: [] }>();
</script>

<template>
  <div class="undo" role="status">
    <Icon name="trash" :size="16" />
    <span class="undo-text">{{ label }}</span>
    <button type="button" class="btn btn-xs undo-btn" @click="emit('undo')">Undo</button>
    <button type="button" class="undo-x" aria-label="Dismiss" @click="emit('dismiss')"><Icon name="x" :size="14" /></button>
  </div>
</template>

<style scoped>
.undo {
  position: absolute;
  left: var(--s-3);
  right: var(--s-3);
  bottom: 2.6rem;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0.45rem 0.45rem 0.45rem 0.8rem;
  background: var(--fg);
  color: var(--bg);
  border: 2px solid var(--line-strong);
  box-shadow: var(--shadow-label);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: 600;
  animation: undo-in var(--dur-3) var(--ease-thunk);
}
@keyframes undo-in {
  from {
    transform: translateY(10px) rotate(-1.5deg);
    opacity: 0;
  }
}
.undo-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.undo-btn {
  --btn-bg: var(--accent);
  --btn-fg: var(--on-accent);
  --btn-border: var(--accent);
  --btn-shadow: var(--bg);
}
.undo-x {
  display: grid;
  place-items: center;
  width: 1.8rem;
  height: 1.8rem;
  border: 0;
  background: transparent;
  color: inherit;
}
@media (pointer: coarse) {
  .undo {
    bottom: var(--s-3);
  }
}
@media (max-width: 720px) {
  .undo {
    position: fixed;
    bottom: var(--s-4);
    left: var(--s-3);
    right: var(--s-3);
  }
}
</style>
