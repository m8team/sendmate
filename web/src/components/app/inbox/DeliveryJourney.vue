<script setup lang="ts">
/**
 * Where a submission went: one row per channel, with "Retry now" on failed deliveries.
 * Arrival time, origin and the spam score have their own places in the detail, so only delivery shows here.
 */
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import type { Channel, Form, Submission } from '../../../lib/api/types';
import { TONE_ICON, journeySteps } from './journey';

const props = defineProps<{
  s: Submission;
  formId: string;
  formStatus: Form['status'];
  channels: Channel[];
  now: number;
  digestHourUtc: number;
  spamRetentionDays: number;
  maxDeliveryAttempts: number;
  retrying: boolean;
}>();
const emit = defineEmits<{ retry: [] }>();

const BEFORE_DELIVERY = new Set(['received', 'check', 'stored']);

const steps = computed(() =>
  journeySteps(props.s, {
    formId: props.formId,
    formStatus: props.formStatus,
    now: props.now,
    digestHourUtc: props.digestHourUtc,
    spamRetentionDays: props.spamRetentionDays,
    maxDeliveryAttempts: props.maxDeliveryAttempts,
  }).filter((st) => !BEFORE_DELIVERY.has(st.key)),
);

/** Why nothing went out, for submissions that never reach the delivery stage. */
const stopped = computed(() => {
  if (props.s.status === 'spam') return 'Not delivered: marked as spam.';
  if (props.s.status === 'held') return 'Not delivered while it’s held.';
  if (props.s.status === 'pending_challenge') return 'Delivered once the visitor passes the captcha.';
  return null;
});

/** One "Retry now" button, on the first failed row: the API retries every failed delivery at once. */
const retryable = computed(() => steps.value.filter((st) => st.retryable));
const firstRetryable = computed(() => retryable.value[0]?.key ?? null);
</script>

<template>
  <p v-if="stopped" class="stopped">{{ stopped }}</p>
  <ul v-else role="list" class="dl">
    <li v-for="st in steps" :key="st.key" class="drow" :class="`t-${st.tone}`">
      <span class="dnode" aria-hidden="true"><Icon :name="TONE_ICON[st.tone]" :size="12" :stroke-width="2.5" /></span>
      <div class="dbody">
        <p class="dhead">
          <span class="dtitle">{{ st.title }}</span>
          <span v-if="st.tag" class="tag" :class="st.tag.cls">{{ st.tag.text }}</span>
          <span v-if="st.time" class="dtime">{{ st.time }}</span>
        </p>
        <p v-for="(l, i) in st.lines" :key="i" class="dline">{{ l }}</p>
        <p v-if="st.key === 'none'" class="dline"><a :href="`/app/forms/${formId}/settings#channels`">Set up a channel</a></p>
        <p v-if="st.retryable && s.status === 'ok' && st.key === firstRetryable" class="dact">
          <button type="button" class="btn btn-outline btn-xs" :aria-disabled="retrying ? 'true' : undefined" @click="!retrying && emit('retry')">
            <Icon name="refresh" :size="14" :class="{ spin: retrying }" />
            {{ retrying ? 'Trying…' : retryable.length > 1 ? `Retry all ${retryable.length}` : 'Retry now' }}
          </button>
        </p>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.stopped {
  color: var(--fg-muted);
}
.dl {
  display: grid;
  gap: var(--s-3);
}
.drow {
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  column-gap: var(--s-3);
  align-items: start;
}
.dnode {
  display: grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  margin-top: 0.05rem;
  border-radius: 50%;
  background: var(--ok-wash);
  color: var(--ok);
}
.t-bad .dnode {
  background: var(--signal-wash);
  color: var(--signal-text);
}
.t-warn .dnode {
  background: var(--warn-wash);
  color: var(--warn);
}
.t-wait .dnode,
.t-skip .dnode {
  background: var(--bg-sunk);
  color: var(--fg-muted);
}
.dbody {
  min-width: 0;
}
.dhead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-1) var(--s-2);
}
.dtitle {
  font-weight: 600;
}
.dtime {
  margin-left: auto;
  font-size: var(--fs-2xs);
  font-variant-numeric: tabular-nums;
  color: var(--fg-muted);
  white-space: nowrap;
}
.dline {
  margin-top: 0.125rem;
  color: var(--fg-muted);
}
.t-bad .dline:first-of-type,
.t-warn .dline:first-of-type {
  color: var(--fg);
}
.dact {
  margin-top: var(--s-2);
}
.spin {
  animation: spin 900ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
