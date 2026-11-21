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
    <p class="g-read">
      <span class="g-verdict">{{ v.word }}</span>
      <span class="g-num tabular">{{ s.spamScore.toFixed(2) }}</span>
    </p>
    <div class="g-scale" role="img" :aria-label="label">
      <span class="g-fill"></span>
      <span class="g-line"></span>
    </div>
    <p class="g-axis" aria-hidden="true">
      <span>0 · human</span>
      <span>spam from {{ SPAM_LINE.toFixed(2) }}</span>
    </p>
  </div>
  <ul v-if="s.spamReasons.length" role="list" class="reasons">
    <li v-for="r in s.spamReasons" :key="r"><Icon name="flag" :size="13" /> {{ spamReasonLabel(r) }}</li>
  </ul>

</template>

<style scoped>
.gauge {
  --score: 0;
  --g-color: var(--ok);
  display: grid;
  gap: var(--s-2);
  max-width: 24rem;
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
}
.g-verdict {
  font-weight: 600;
}
.g-num {
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}
.g-scale {
  position: relative;
  height: 6px;
  border-radius: var(--r-round);
  background: var(--bg-deep);
}
.g-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: max(4px, calc(var(--score) * 100%));
  border-radius: inherit;
  background: var(--g-color);
}
.g-line {
  position: absolute;
  top: -3px;
  bottom: -3px;
  left: calc(var(--spam-line, 0.5) * 100% - 1px);
  width: 2px;
  background: var(--fg-muted);
}
.g-axis {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
}
.reasons {
  display: grid;
  gap: 0.35rem;
  margin-top: var(--s-2);
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
  margin-top: var(--s-2);
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}
</style>
