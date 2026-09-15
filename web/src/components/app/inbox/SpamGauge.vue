<script setup lang="ts">
/** The spam score as a needle on a 0–1 scale with the spam line marked, plus the reasons behind it. */
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import type { Submission } from '../../../lib/api/types';
import { spamReasonLabel } from '../../../lib/api/adapters';
import { SPAM_LINE, verdict } from '../InboxUtils';
import { gaugeLabel } from './journey';

const props = defineProps<{ s: Submission }>();

const v = computed(() => verdict(props.s));
const label = computed(() => gaugeLabel(props.s));
</script>

<template>
  <div class="gauge" :class="`g-${v.tone}`" :style="{ '--score': s.spamScore, '--spam-line': SPAM_LINE }">
    <div class="g-read">
      <span class="g-num tabular">{{ s.spamScore.toFixed(2) }}</span>
      <span class="g-verdict">{{ v.word }}</span>
    </div>
    <div class="g-scale" role="img" :aria-label="label">
      <span class="g-zone"></span>
      <span class="g-line"></span>
      <span class="g-needle"></span>
    </div>
    <div class="g-axis mono" aria-hidden="true">
      <span>0.00 human</span>
      <span class="g-axis-mid">{{ SPAM_LINE.toFixed(2) }} spam line</span>
      <span>1.00 bot</span>
    </div>
  </div>
  <ul v-if="s.spamReasons.length" role="list" class="reasons">
    <li v-for="r in s.spamReasons" :key="r"><Icon name="flag" :size="14" /> {{ spamReasonLabel(r) }}</li>
  </ul>
  <p v-else class="reasons-none">Nothing suspicious. Honeypot empty, no dodgy links, no spammy phrases.</p>
</template>

<style scoped>
.gauge {
  --score: 0;
  --g-color: var(--ok);
  display: grid;
  gap: var(--s-2);
  padding: var(--s-4);
  border: var(--bw-strong) solid var(--line-strong);
  background: var(--bg-raised);
}
.g-bad {
  --g-color: var(--signal);
}
.g-warn {
  --g-color: var(--warn);
}
.g-read {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--s-3);
  flex-wrap: wrap;
}
.g-num {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: 3.2rem;
  line-height: 0.85;
}
.g-verdict {
  font-family: var(--font-display);
  font-stretch: var(--stretch-expanded);
  font-weight: 800;
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg);
  padding: 0.25em 0.5em;
  border-left: 5px solid var(--g-color);
  background: var(--bg-sunk);
}
.g-scale {
  position: relative;
  height: 1.4rem;
  margin-top: var(--s-2);
  border: 1.5px solid var(--line-strong);
  background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), var(--line) calc(10% - 1px) 10%);
}
.g-zone {
  position: absolute;
  inset: 0 0 0 calc(var(--spam-line, 0.5) * 100%);
  background: repeating-linear-gradient(-45deg, var(--signal-wash) 0 5px, transparent 5px 10px);
}
.g-line {
  position: absolute;
  top: -6px;
  bottom: -6px;
  left: calc(var(--spam-line, 0.5) * 100% - 1px);
  width: 2px;
  background: var(--signal);
}
.g-needle {
  position: absolute;
  top: -9px;
  bottom: -3px;
  left: calc(var(--score) * 100%);
  width: 0;
  transform: translateX(-50%);
  animation: needle var(--dur-4) var(--ease-out) both;
}
.g-needle::before {
  content: '';
  position: absolute;
  top: 0;
  left: -7px;
  border: 7px solid transparent;
  border-top: 9px solid var(--fg);
}
.g-needle::after {
  content: '';
  position: absolute;
  top: 8px;
  bottom: 0;
  left: -2px;
  width: 4px;
  background: var(--fg);
}
@keyframes needle {
  from {
    left: 0;
  }
}
.g-axis {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
}
.g-axis-mid {
  color: var(--signal-text);
  font-weight: 600;
}
.reasons {
  display: grid;
  gap: 0.4rem;
}
.reasons li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.5rem;
  align-items: baseline;
  font-size: var(--fs-sm);
  line-height: 1.4;
}
.reasons li :deep(svg),
.reasons li svg {
  color: var(--signal-text);
  transform: translateY(2px);
}
.reasons-none {
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}
</style>
