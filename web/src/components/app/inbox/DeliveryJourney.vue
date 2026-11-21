<script setup lang="ts">
/** Where a submission went, as a timeline, with "Retry now" on failed deliveries. */
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
const emit = defineEmits<{ retry: []; release: [] }>();

const isHeld = computed(() => props.s.status === 'held');
const isBlocked = computed(() => props.s.status === 'spam' || props.s.status === 'held');

const steps = computed(() =>
  journeySteps(props.s, {
    formId: props.formId,
    formStatus: props.formStatus,
    now: props.now,
    digestHourUtc: props.digestHourUtc,
    spamRetentionDays: props.spamRetentionDays,
    maxDeliveryAttempts: props.maxDeliveryAttempts,
  }),
);

/** One "Retry now" button, on the first failed step: the API retries every failed delivery at once. */
const retryableSteps = computed(() => steps.value.filter((st) => st.retryable));
const retryableCount = computed(() => retryableSteps.value.length);
const firstRetryable = computed(() => retryableSteps.value[0]?.key ?? null);
</script>

<template>
  <ol role="list" :key="s.id" class="journey">
    <li v-for="st in steps" :key="st.key" class="jstep" :class="`t-${st.tone}`">
      <span class="jnode" aria-hidden="true"><Icon :name="TONE_ICON[st.tone]" :size="12" :stroke-width="2.5" /></span>
      <div class="jbody">
        <p class="jhead">
          <Icon :name="st.icon" :size="16" class="jicon" />
          <span class="jtitle">{{ st.title }}</span>
          <span v-if="st.tag" class="tag" :class="st.tag.cls">{{ st.tag.text }}</span>
          <span v-if="st.time" class="jtime">{{ st.time }}</span>
        </p>
        <p v-if="st.target" class="mono jtarget">{{ st.target }}</p>
        <p v-for="(l, i) in st.lines" :key="i" class="jline">{{ l }}</p>
        <p v-if="st.retryable && s.status === 'ok' && st.key === firstRetryable" class="jact">
          <button type="button" class="btn btn-outline btn-xs" :aria-disabled="retrying ? 'true' : undefined" @click="!retrying && emit('retry')">
            <Icon name="refresh" :size="14" :class="{ spin: retrying }" />
            {{ retrying ? 'Trying…' : retryableCount > 1 ? `Retry all ${retryableCount} now` : 'Retry now' }}
          </button>
        </p>
      </div>
    </li>
    <li v-if="isBlocked" class="jstep t-stop">
      <span class="jnode" aria-hidden="true"><Icon name="x" :size="12" :stroke-width="2.5" /></span>
      <div class="jbody">
        <p class="jhead">
          <Icon name="send" :size="16" class="jicon" />
          <span class="jtitle">Not delivered</span>
          <span class="tag tag-signal">Stopped</span>
        </p>
        <p class="jline">
          {{ isHeld ? 'Held back from all' : 'Kept away from all' }} {{ channels.filter((c) => c.enabled).length }} of your channels.
          {{ isHeld ? 'It stays that way while it’s under review.' : 'Mark it not spam and it’s queued for delivery straight away.' }}
        </p>
        <p v-if="!isHeld" class="jact">
          <button type="button" class="btn btn-signal btn-xs" @click="emit('release')"><Icon name="send" :size="14" /> Not spam, deliver it</button>
        </p>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.journey {
  position: relative;
  display: grid;
  border-top: 1px solid var(--line);
  padding-top: var(--s-3);
}
.jstep {
  position: relative;
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr);
  column-gap: var(--s-3);
  padding-bottom: var(--s-4);
}
.jstep:last-child {
  padding-bottom: 0;
}
.jstep:not(:last-child)::before {
  content: '';
  position: absolute;
  left: calc(0.625rem - 0.5px);
  top: 1.35rem;
  bottom: 0.1rem;
  width: 1px;
  background: var(--line);
}
.jnode {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: var(--ok-wash);
  color: var(--ok);
}
.t-bad .jnode,
.t-stop .jnode {
  background: var(--signal-wash);
  color: var(--signal-text);
}
.t-warn .jnode {
  background: var(--warn-wash);
  color: var(--warn);
}
.t-wait .jnode,
.t-skip .jnode {
  background: var(--bg-sunk);
  color: var(--fg-muted);
}
.jbody {
  min-width: 0;
}
.jhead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.5rem;
  min-height: 1.25rem;
}
.jicon {
  display: none;
}
.jtitle {
  font-weight: 600;
  font-size: var(--fs-sm);
  line-height: 1.3;
}
.jtime {
  margin-left: auto;
  font-family: var(--font-text);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  color: var(--fg-muted);
  white-space: nowrap;
}
.jtarget {
  margin-top: 0.15rem;
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.jline {
  margin-top: 0.15rem;
  font-size: var(--fs-sm);
  line-height: 1.45;
  color: var(--fg-muted);
}
.t-bad .jline,
.t-warn .jline:first-of-type {
  color: var(--fg);
}
.jact {
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
