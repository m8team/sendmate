<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { channelMeta } from '../SettingsChannelRules';
import ChannelTestResult from './ChannelTestResult.vue';
import WebhookSecret from './WebhookSecret.vue';
import type { ChanState } from './channelHelpers';
import { useFormSettings } from './useFormSettings';

/** One channel as a routing slip: label, on/off switch, test and remove. */
defineProps<{ channel: ChanState }>();

const { clock, sendTest, startRename, stopRename, saveRename, toggleChannel, removeChannel, askRemove, keep } = useFormSettings();
</script>

<template>
  <li class="slip" :class="{ off: !channel.enabled }">
    <div class="slip-main">
      <span class="slip-icon" aria-hidden="true"><Icon :name="channelMeta[channel.type].icon" :size="20" /></span>
      <div class="slip-id">
        <form v-if="channel.renaming" class="slip-rename" novalidate @submit.prevent="saveRename(channel)" @keydown.esc.prevent="stopRename(channel)">
          <label class="sr-only" :for="`fs-rename-${channel.id}`">Channel label</label>
          <input
            :id="`fs-rename-${channel.id}`"
            v-model="channel.renameDraft"
            class="input"
            maxlength="80"
            autocomplete="off"
            :aria-invalid="channel.renameError ? 'true' : undefined"
            :aria-describedby="channel.renameError ? `fs-rename-err-${channel.id}` : undefined"
          />
          <button type="submit" class="btn btn-signal btn-sm" :aria-disabled="channel.busy ? 'true' : undefined">Save</button>
          <button type="button" class="btn btn-ghost btn-sm" @click="stopRename(channel)">Cancel</button>
          <p v-if="channel.renameError" :id="`fs-rename-err-${channel.id}`" class="field-error"><Icon name="alert" :size="14" /> {{ channel.renameError }}</p>
        </form>
        <h3 v-else :id="`fs-ch-${channel.id}`" class="slip-label">
          {{ channel.label }}
          <button :id="`fs-rename-btn-${channel.id}`" type="button" class="slip-rename-btn" :aria-label="`Rename ${channel.label}`" @click="startRename(channel)">
            <Icon name="settings" :size="14" /> <span>Rename</span>
          </button>
        </h3>
        <p class="slip-meta">
          <span class="label">{{ channelMeta[channel.type].name }}</span>
          <span v-if="channel.type === 'email' && channel.recipientVerified === false" class="tag tag-warn">Not verified yet</span>
          <span v-else-if="channel.type === 'email'" class="tag tag-ok">Verified</span>
        </p>
      </div>
      <label class="slip-switch">
        <input v-model="channel.enabled" type="checkbox" class="switch" :disabled="channel.busy" :aria-describedby="`fs-ch-${channel.id}`" @change="toggleChannel(channel)" />
        <span class="slip-switch-text">{{ channel.enabled ? 'On' : 'Off' }}</span>
      </label>
    </div>

    <div v-if="channel.type === 'email' && channel.recipientVerified === false" class="secret">
      <p class="secret-help">
        Nothing is emailed here until the address clicks the verification link we sent. You can resend it from
        <a class="link-signal" href="/app/account/email">Email &amp; BYOK</a>.
      </p>
    </div>

    <WebhookSecret v-if="channel.type === 'webhook'" :channel="channel" />

    <div class="slip-foot">
      <ChannelTestResult :channel="channel" :now="clock" />
      <span class="sr-only" role="status" aria-live="polite">{{ channel.announce }}</span>

      <div v-if="!channel.confirmRemove" class="slip-actions">
        <button :id="`fs-test-${channel.id}`" type="button" class="btn btn-outline btn-sm" :aria-disabled="channel.testing ? 'true' : undefined" @click="sendTest(channel)">
          <Icon :name="channel.testing ? 'clock' : 'send'" :size="16" /> {{ channel.testing ? 'Sending…' : 'Send test' }}
        </button>
        <button :id="`fs-remove-${channel.id}`" type="button" class="btn btn-ghost btn-sm slip-remove" @click="askRemove(channel)">
          <Icon name="trash" :size="16" /> Remove<span class="sr-only"> {{ channel.label }}</span>
        </button>
      </div>
      <div v-else class="slip-confirm" role="group" :aria-label="`Remove ${channel.label}?`">
        <span>Remove <b>{{ channel.label }}</b>?</span>
        <button :id="`fs-keep-${channel.id}`" type="button" class="btn btn-ghost btn-sm" @click="keep(channel)">Keep it</button>
        <button type="button" class="btn btn-danger btn-sm" :aria-disabled="channel.busy ? 'true' : undefined" @click="removeChannel(channel)">Yes, remove</button>
      </div>
    </div>
  </li>
</template>

<style scoped>
.slip {
  min-width: 0;
  border: 1.5px solid var(--line-strong);
  background: var(--bg);
  border-left-width: 6px;
}
.slip.off {
  border-style: dashed;
  border-left-style: solid;
  border-left-color: var(--line);
}
.slip-main {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
}
.slip-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1.5px solid var(--line-strong);
  border-radius: 50%;
}
.slip.off .slip-icon {
  color: var(--fg-muted);
  border-color: var(--line);
}
.slip-id {
  flex: 1;
  min-width: 0;
}
.slip-label {
  font-family: var(--font-display);
  font-stretch: var(--stretch-semi);
  font-weight: 800;
  font-size: 1.15rem;
  line-height: 1.15;
}
.slip-meta {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  min-width: 0;
  margin-top: 0.15rem;
}
.slip-meta .label,
.slip-meta .tag {
  flex: none;
}
.slip-meta .label {
  color: var(--fg-muted);
}
.slip-switch {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  cursor: pointer;
}
.slip-switch-text {
  width: 1.8rem;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: 600;
}
.slip-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--s-2) var(--s-4);
  padding: var(--s-2) var(--s-4) var(--s-3);
  border-top: 1px dashed var(--line);
}
.slip-actions,
.slip-confirm {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
}
.slip-confirm {
  font-size: var(--fs-sm);
}
.slip-remove {
  color: var(--fg-muted);
}
.slip-remove:hover {
  color: var(--signal-text);
}
/* The "not verified yet" note, drawn like the webhook secret box. */
.secret {
  display: grid;
  gap: var(--s-2);
  margin: 0 var(--s-4) var(--s-3);
  padding: var(--s-3);
  background: var(--bg-sunk);
  border: 1px solid var(--line);
}
.secret-help {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}

.slip-rename {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}
.slip-rename .input {
  flex: 1 1 12rem;
  min-width: 0;
  min-height: 2.25rem;
  padding-block: 0.3rem;
}
.slip-rename .field-error {
  flex-basis: 100%;
}
.slip-rename-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: var(--s-2);
  padding: 0.1rem 0.35rem;
  border: 1px solid transparent;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  font-size: var(--fs-2xs);
  font-weight: 500;
  font-stretch: normal;
  letter-spacing: var(--track-label);
  text-transform: uppercase;
  vertical-align: middle;
  cursor: pointer;
}
.slip-rename-btn:hover,
.slip-rename-btn:focus-visible {
  color: var(--fg);
  border-color: var(--line-strong);
}

@media (max-width: 560px) {
  .slip-main {
    padding: var(--s-3);
    align-items: flex-start;
  }
  .slip-icon {
    width: 2.1rem;
    height: 2.1rem;
  }
  .slip-meta {
    flex-direction: column;
    gap: 0;
  }
  .slip-switch-text {
    display: none;
  }
  .slip-foot {
    padding-inline: var(--s-3);
  }
  .slip-actions {
    width: 100%;
  }
  .slip-actions .btn-outline {
    flex: 1;
  }
  .secret {
    margin-inline: var(--s-3);
  }
}
</style>
