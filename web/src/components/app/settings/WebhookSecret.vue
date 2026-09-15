<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { maskSecret, type ChanState } from './channelHelpers';
import { useFormSettings } from './useFormSettings';

/** A webhook's signing secret: revealed once after it's made, rotatable any time. */
defineProps<{ channel: ChanState }>();

const { limits, rotate } = useFormSettings();
</script>

<template>
  <div class="secret">
    <div class="secret-row">
      <span class="label">Signing secret</span>
      <template v-if="channel.secret">
        <code class="secret-val">{{ channel.reveal ? channel.secret : maskSecret(channel.secret) }}</code>
        <button type="button" class="btn btn-ghost btn-xs" :aria-pressed="channel.reveal" @click="channel.reveal = !channel.reveal">
          <Icon :name="channel.reveal ? 'eye-off' : 'eye'" :size="14" /> {{ channel.reveal ? 'Hide' : 'Reveal' }}
        </button>
        <button type="button" class="btn btn-ghost btn-xs copy-btn" :data-copy="channel.secret" data-copy-toast="Signing secret copied">
          <span class="copy-idle"><Icon name="copy" :size="14" /><span>Copy</span></span>
          <span class="copy-done" aria-hidden="true"><Icon name="check" :size="14" /><span>Copied</span></span>
        </button>
      </template>
      <code v-else class="secret-val">whsec_••••••••••••••••••</code>
      <button type="button" class="btn btn-ghost btn-xs" :aria-disabled="channel.busy ? 'true' : undefined" @click="rotate(channel)">
        <Icon name="refresh" :size="14" /> Rotate
      </button>
    </div>
    <p class="secret-help">
      <template v-if="channel.secret"><b>Copy it now: it’s only shown this once.</b> </template>
      <template v-else>Only shown when it’s made. Lost it? Rotate for a new one (the old one stops working straight away). </template>
      Every request carries <code>X-Sendm8-Signature: t=…,v1=…</code>. Check that <code>v1</code> is the HMAC-SHA256 of <code>t.body</code> using this secret, and reject
      anything older than 5 minutes. We give up after {{ limits.webhookTimeoutSeconds }}s, so reply fast and do the heavy lifting later.
    </p>
  </div>
</template>

<style scoped>
.secret {
  display: grid;
  gap: var(--s-2);
  margin: 0 var(--s-4) var(--s-3);
  padding: var(--s-3);
  background: var(--bg-sunk);
  border: 1px solid var(--line);
}
.secret-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
}
.secret-row .label {
  color: var(--fg-muted);
}
.secret-val {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap !important;
}
.secret-help {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
.secret-help code {
  white-space: normal;
}
@media (max-width: 560px) {
  .secret {
    margin-inline: var(--s-3);
  }
  .secret-row .label {
    flex-basis: 100%;
  }
  .secret-val {
    flex-basis: 100%;
    white-space: normal !important;
    overflow-wrap: anywhere;
  }
}
</style>
