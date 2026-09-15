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
        ><span class="savebar-sub"> · {{ errors.general ?? 'nothing’s live until you save' }}</span>
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
  /* Lines up with the panels, past the tab rail and its gap in FormSettings. */
  margin-left: calc(13rem + clamp(1.25rem, 3vw, 2.5rem));
  padding: 0.55rem 0.6rem 0.55rem 1rem;
  background: var(--fg);
  color: var(--bg);
  border: 2px solid var(--fg);
  box-shadow: 4px 4px 0 0 var(--signal);
}
.savebar-text {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-sm);
}
.savebar-sub {
  opacity: 0.75;
}
.savebar-dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  background: var(--accent);
}
.savebar-actions {
  display: flex;
  gap: var(--s-2);
}
.savebar .btn-ghost {
  --btn-fg: var(--bg);
}
.savebar .btn-ghost:hover {
  --btn-border: var(--bg);
}
.savebar .btn-signal {
  --btn-shadow: var(--accent);
}
.savebar-enter-active,
.savebar-leave-active {
  transition:
    transform var(--dur-3) var(--ease-thunk),
    opacity var(--dur-2);
}
.savebar-enter-from,
.savebar-leave-to {
  transform: translateY(1.5rem);
  opacity: 0;
}
@media (max-width: 860px) {
  .savebar {
    margin-left: 0;
    bottom: var(--s-3);
  }
}
@media (max-width: 560px) {
  .savebar-sub {
    display: none;
  }
}
</style>
