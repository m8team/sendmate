<script setup lang="ts">
import type { EmailSettingsDto } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import SenderPicker from './SenderPicker.vue';
import { useEmailAccount } from './useEmailAccount';

/** A saved key: whether Resend still accepts it, its from address, and replace / remove. */
defineProps<{ byok: EmailSettingsDto['byok'] }>();

const { healthy, limit, resendKey } = useEmailAccount();
const { justVerified, confirmRemove, removing, startReplace, askRemove, keepKey, removeKey } = resendKey;
</script>

<template>
  <div class="verified">
    <div class="verified-top">
      <div>
        <h3 id="rk-verified-title" class="h4" tabindex="-1">{{ healthy ? 'Connected and checked' : 'Resend stopped accepting your key' }}</h3>
        <p class="muted small">
          {{
            healthy
              ? 'All your notifications now go through your own Resend account.'
              : 'Notifications are waiting for the digest instead of switching to our sender. Replace the key to get them moving again.'
          }}
        </p>
      </div>
      <span v-if="healthy" class="stamp stamp-lg stamp-ok rk-stamp" :class="{ thunk: justVerified }" style="--stamp-rotate: -8deg">Verified</span>
      <span v-else class="stamp stamp-lg stamp-warn rk-stamp" style="--stamp-rotate: -8deg">Returned</span>
    </div>

    <div v-if="!healthy && byok.error" class="notice notice-signal" role="alert">
      <span class="notice-icon"><Icon name="alert" :size="18" /></span>
      <p class="notice-title">What Resend said</p>
      <div class="notice-body"><p class="mono">{{ byok.error }}</p></div>
    </div>

    <div class="keyline">
      <span class="keyline-icon" aria-hidden="true"><Icon name="key" :size="18" /></span>
      <span class="sr-only">Saved key:</span>
      <code class="keyline-val">{{ byok.keyHint }}</code>
      <span v-if="healthy" class="tag tag-ok">Can send</span>
      <span v-else class="tag tag-signal">Rejected</span>
      <span class="tag tag-plain">Encrypted</span>
    </div>

    <SenderPicker :saved-from="byok.from" />

    <div class="removezone">
      <div v-if="!confirmRemove" class="cluster">
        <button type="button" class="btn btn-outline btn-sm" @click="startReplace"><Icon name="refresh" :size="16" /> Replace key</button>
        <button id="rk-remove" type="button" class="btn btn-ghost btn-sm rk-remove" @click="askRemove"><Icon name="trash" :size="16" /> Remove key</button>
      </div>
      <div v-else class="confirm" role="group" aria-labelledby="rk-confirm-text">
        <p id="rk-confirm-text">
          <b>Remove your key?</b> We’ll delete it straight away and go back to our sender, capped at {{ limit }} instant emails a day. You might want to revoke it in
          Resend too.
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
  padding: var(--s-5);
}
.verified-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--s-4);
}
.verified-top .h4:focus,
.verified-top .h4:focus-visible {
  outline: none;
  box-shadow: none;
}
.verified-top p {
  margin-top: 0.3rem;
  max-width: 40ch;
}
.rk-stamp {
  flex: none;
  margin: 0.4rem 0.4rem 0 0;
  box-shadow:
    inset 0 0 0 3px var(--bg-raised),
    inset 0 0 0 5.5px var(--stamp-color);
}
.rk-stamp.thunk {
  animation: rk-thunk 440ms var(--ease-thunk) both;
}
@keyframes rk-thunk {
  0% {
    transform: scale(2.4) rotate(calc(var(--stamp-rotate) - 14deg));
    opacity: 0;
  }
  55% {
    transform: scale(0.92) rotate(var(--stamp-rotate));
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(var(--stamp-rotate));
  }
}
.keyline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-3);
  padding: 0.7rem 0.85rem;
  border: var(--bw-strong) solid var(--line-strong);
  background: var(--bg);
}
.keyline-icon {
  display: grid;
  place-items: center;
}
.keyline-val {
  flex: 1;
  font-size: 1rem;
  background: none;
  border: 0;
  padding: 0;
  letter-spacing: 0.04em;
}
.removezone {
  padding-top: var(--s-3);
  border-top: 1px dashed var(--line);
}
.rk-remove {
  color: var(--signal-text);
}
.confirm {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-4);
  border: 1.5px solid var(--signal);
  background: var(--signal-wash);
  font-size: var(--fs-sm);
}
@media (max-width: 560px) {
  .verified {
    padding: var(--s-4);
  }
  .verified-top {
    flex-direction: column-reverse;
  }
}
</style>
