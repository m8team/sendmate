<script setup lang="ts">
import type { EmailSettingsDto } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import SenderPicker from './SenderPicker.vue';
import { useEmailAccount } from './useEmailAccount';

/** A saved key: whether Resend still accepts it, its from address, and replace / remove. */
defineProps<{ byok: EmailSettingsDto['byok'] }>();

const { healthy, limit, resendKey } = useEmailAccount();
const { confirmRemove, removing, startReplace, askRemove, keepKey, removeKey } = resendKey;
</script>

<template>
  <div class="verified">
    <div class="verified-top">
      <div>
        <h3 id="rk-verified-title" class="h4" tabindex="-1">{{ healthy ? 'Connected' : 'Resend rejected your key' }}</h3>
        <p v-if="!healthy" class="muted small">Emails wait for the digest until you replace it.</p>
      </div>
    </div>

    <div v-if="!healthy && byok.error" class="notice notice-signal" role="alert">
      <span class="notice-icon"><Icon name="alert" :size="18" /></span>
      <p class="notice-title">What Resend said</p>
      <div class="notice-body"><p class="mono">{{ byok.error }}</p></div>
    </div>

    <div class="keyline">
      <span class="keyline-icon" aria-hidden="true"><Icon name="key" :size="16" /></span>
      <span class="sr-only">Saved key:</span>
      <code class="keyline-val">{{ byok.keyHint }}</code>
      <span v-if="healthy" class="tag tag-ok">Can send</span>
      <span v-else class="tag tag-signal">Rejected</span>
    </div>

    <SenderPicker :saved-from="byok.from" />

    <div class="removezone">
      <div v-if="!confirmRemove" class="cluster">
        <button type="button" class="btn btn-outline btn-sm" @click="startReplace"><Icon name="refresh" :size="16" /> Replace key</button>
        <button id="rk-remove" type="button" class="btn btn-ghost btn-sm rk-remove" @click="askRemove"><Icon name="trash" :size="16" /> Remove key</button>
      </div>
      <div v-else class="confirm" role="group" aria-labelledby="rk-confirm-text">
        <p id="rk-confirm-text">
          <b>Remove your key?</b> Emails go back to our sender, limited to {{ limit }} a day.
        </p>
        <div class="cluster">
          <button id="rk-keep" type="button" class="btn btn-ghost btn-sm" @click="keepKey">Keep it</button>
          <button type="button" class="btn btn-danger btn-sm" :aria-disabled="removing ? 'true' : undefined" @click="removeKey">
            {{ removing ? 'Removing…' : 'Yes, remove key' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./account-panel.css"></style>
<style scoped>
.verified {
  display: grid;
  gap: var(--s-4);
}
.verified-top .h4:focus,
.verified-top .h4:focus-visible {
  outline: none;
  box-shadow: none;
}
.verified-top p {
  margin-top: var(--s-1);
}
.keyline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-3);
  padding: var(--s-2) var(--s-3);
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  background: var(--bg-sunk);
}
.keyline-icon {
  display: grid;
  place-items: center;
  color: var(--fg-muted);
}
.keyline-val {
  flex: 1;
  background: none;
  border: 0;
  padding: 0;
}
.rk-remove {
  color: var(--signal-text);
}
.confirm {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-3);
  border: 1px solid var(--signal);
  border-radius: var(--r-2);
  background: var(--signal-wash);
}
</style>
