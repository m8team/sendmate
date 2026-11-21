<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { useFormSettings } from './useFormSettings';

/** Sticky "Unsaved changes" bar: appears once the draft differs from what's saved. */
const { dirty, deleted, errors, saving, save, discard } = useFormSettings();
</script>

<template>
  <Transition name="savebar">
    <div v-if="dirty && !deleted" class="savebar" role="region" aria-label="Unsaved changes">
      <p class="savebar-text">
        <span class="savebar-dot" aria-hidden="true"></span> <b>{{ errors.general ? 'Not saved' : 'Unsaved changes' }}</b
        ><span v-if="errors.general" class="savebar-sub"> · {{ errors.general }}</span>
      </p>
      <div class="savebar-actions">
        <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="discard">Discard</button>
        <button type="button" class="btn btn-signal btn-sm" :aria-disabled="saving ? 'true' : undefined" @click="save">
          <Icon :name="saving ? 'clock' : 'check'" :size="16" /> {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.savebar {
  position: sticky;
  bottom: var(--s-4);
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  flex-wrap: wrap;
  margin-top: var(--s-5);
  padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  box-shadow: 0 8px 28px rgb(0 0 0 / 0.18);
}
.savebar-text {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-sm);
}
.savebar-sub {
  color: var(--fg-muted);
}
.savebar-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--warn);
}
.savebar-actions {
  display: flex;
  gap: var(--s-2);
}
.savebar-enter-active,
.savebar-leave-active {
  transition:
    transform var(--dur-3) var(--ease-out),
    opacity var(--dur-2);
}
.savebar-enter-from,
.savebar-leave-to {
  transform: translateY(0.75rem);
  opacity: 0;
}
@media (max-width: 860px) {
  .savebar {
    bottom: var(--s-3);
  }
}
@media (max-width: 560px) {
  .savebar-sub {
    display: none;
  }
}
</style>
