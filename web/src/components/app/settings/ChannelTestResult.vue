<script setup lang="ts">
import { ago } from '../InboxUtils';
import type { ChanState } from './channelHelpers';

/** The outcome of a channel's latest "Send test". */
defineProps<{ channel: ChanState; now: number }>();
</script>

<template>
  <p class="slip-test" :class="{ bad: channel.lastTest && !channel.lastTest.ok }">
    <template v-if="channel.testing"><span class="tag tag-plain">Sending…</span> Test in transit</template>
    <template v-else-if="channel.lastTest">
      <span :class="channel.lastTest.ok ? 'tag tag-ok' : 'tag tag-signal'">{{ channel.lastTest.ok ? 'Test ok' : 'Test failed' }}</span>
      <span class="mono">{{ channel.lastTest.message }}</span>
      <span class="muted">· <time :datetime="new Date(channel.lastTest.at).toISOString()">{{ ago(channel.lastTest.at, now) }}</time></span>
    </template>
    <template v-else><span class="tag tag-plain">Not tested yet</span></template>
  </p>
</template>

<style scoped>
.slip-test {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
  font-size: var(--fs-xs);
  min-width: 0;
}
.slip-test.bad .mono {
  color: var(--signal-text);
  font-weight: 600;
}
</style>
