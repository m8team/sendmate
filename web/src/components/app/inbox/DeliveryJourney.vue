<script setup lang="ts">
/** Where a submission went, as a parcel-tracking timeline, with "Retry now" on failed deliveries. */
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
          <span v-if="st.time" class="mono jtime">{{ st.time }}</span>
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
  border-top: var(--bw-strong) solid var(--line-strong);
  padding-top: var(--s-4);
}
.jstep {
  position: relative;
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr);
  column-gap: var(--s-3);
  padding-bottom: var(--s-5);
}
.jstep:last-child {
  padding-bottom: 0;
}
/* the line between nodes draws itself when a submission opens */
.jstep:not(:last-child)::before {
  content: '';
  position: absolute;
  left: calc(0.75rem - 1px);
  top: 1.5rem;
  bottom: 0;
  width: 2px;
  background: var(--line-strong);
  transform-origin: top;
  animation: draw var(--dur-3) var(--ease-out) both;
}
.jstep:nth-child(2)::before {
  animation-delay: 80ms;
}
.jstep:nth-child(3)::before {
  animation-delay: 160ms;
}
.jstep:nth-child(n + 4)::before {
  animation-delay: 240ms;
}
.jstep.t-stop::before,
.jstep:has(+ .t-stop)::before,
.jstep:has(+ .t-skip)::before,
.jstep:has(+ .t-wait)::before {
  background: repeating-linear-gradient(to bottom, var(--fg-subtle) 0 4px, transparent 4px 8px);
}
@keyframes draw {
  from {
    transform: scaleY(0);
  }
}
.jnode {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border: 2px solid var(--line-strong);
  background: var(--fg);
  color: var(--bg);
}
.t-bad .jnode,
.t-stop .jnode {
  background: var(--signal);
  border-color: var(--signal);
  color: var(--on-signal);
}
.t-warn .jnode {
  background: var(--bg);
  border-color: var(--warn);
  color: var(--warn);
}
.t-wait .jnode,
.t-skip .jnode {
  background: var(--bg);
  border-style: dashed;
  border-color: var(--fg-muted);
  color: var(--fg-muted);
}
.jbody {
  min-width: 0;
  padding-top: 0.05rem;
}
.jhead {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem 0.5rem;
}
.jicon {
  flex: none;
  color: var(--fg-muted);
}
.jtitle {
  font-family: var(--font-display);
  font-stretch: var(--stretch-semi);
  font-weight: 750;
  font-size: 1.02rem;
  line-height: 1.2;
}
.jtime {
  margin-left: auto;
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
  white-space: nowrap;
}
.jtarget {
  margin-top: 0.2rem;
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.jline {
  margin-top: 0.25rem;
  font-size: var(--fs-sm);
  line-height: 1.45;
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
