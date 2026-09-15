<script setup lang="ts">
/** The pigeonhole label above the inbox: name, status, endpoints and this month's usage. */
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import type { Form } from '../../../lib/api/types';
import { emailAddressOf, formStatusTag, usagePct } from './formStatus';

const props = defineProps<{ form: Form; formStatus: Form['status'] }>();

const statusMeta = computed(() => formStatusTag(props.formStatus));
const monthPct = computed(() => usagePct(props.form.monthCount, props.form.monthlyLimit));
const confirmAddress = computed(() => emailAddressOf(props.form.emailEndpoint) ?? 'the address');
</script>

<template>
  <header class="ih">
    <div class="ih-id">
      <p class="label ih-kicker">Pigeonhole inbox</p>
      <div class="ih-titlerow">
        <h1 class="ih-title">{{ form.name }}</h1>
        <span class="tag" :class="statusMeta.cls">{{ statusMeta.text }}</span>
      </div>
    </div>
    <div class="ih-endpoints">
      <div class="endpoint ih-endpoint">
        <span class="endpoint-url" tabindex="0" :aria-label="`Endpoint ${form.endpoint}`">
          <span class="ep-base">{{ form.endpointBase }}</span><span class="ep-id">{{ form.id }}</span>
        </span>
        <button type="button" class="btn btn-ghost btn-xs copy-btn copy-icon-only" :data-copy="form.endpoint" data-copy-toast="Endpoint copied" aria-label="Copy endpoint">
          <span class="copy-idle"><Icon name="copy" :size="16" /></span>
          <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /></span>
        </button>
      </div>
      <div v-if="form.emailEndpoint" class="endpoint ih-endpoint">
        <span class="endpoint-url" tabindex="0" :aria-label="`Email endpoint ${form.emailEndpoint}`">
          <span class="ep-base">{{ form.endpointBase }}</span><span class="ep-id">{{ confirmAddress }}</span>
        </span>
        <button type="button" class="btn btn-ghost btn-xs copy-btn copy-icon-only" :data-copy="form.emailEndpoint" data-copy-toast="Email endpoint copied" aria-label="Copy email endpoint">
          <span class="copy-idle"><Icon name="copy" :size="16" /></span>
          <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /></span>
        </button>
      </div>
    </div>
    <div class="ih-month">
      <p class="ih-month-num tabular">
        <b>{{ form.monthCount.toLocaleString('en-GB') }}</b>
        <span class="mono">/ {{ form.monthlyLimit.toLocaleString('en-GB') }} this month</span>
      </p>
      <span class="meter" :class="{ 'is-high': monthPct > 80 }" :style="{ '--pct': `${Math.max(monthPct, 2)}%` }" role="img" :aria-label="`${monthPct}% of this form's monthly limit used`"></span>
    </div>
  </header>
</template>

<style scoped>
.ih {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--s-3) var(--s-6);
  padding: var(--s-4) clamp(1rem, 2.5vw, 2rem) var(--s-4);
  border-bottom: var(--bw-heavy) solid var(--line-strong);
}
.ih-id {
  min-width: 0;
  margin-right: auto;
}
.ih-kicker {
  color: var(--fg-muted);
}
.ih-titlerow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
}
.ih-title {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(1.9rem, 3vw, 2.6rem);
  line-height: 0.95;
  overflow-wrap: anywhere;
}
.ih-endpoints {
  display: grid;
  gap: var(--s-2);
  min-width: 0;
}
.ih-endpoint {
  border-width: 1px;
  min-width: 0;
  max-width: 24rem;
}
.ih-endpoint .endpoint-url {
  padding: 0.3rem 0.6rem;
  font-size: var(--fs-xs);
}
.ih-endpoint .copy-btn {
  border-left-width: 1px;
  min-height: 2rem;
}
.ih-month {
  display: grid;
  gap: 0.3rem;
  min-width: 12rem;
}
.ih-month-num {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}
.ih-month-num b {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 850;
  font-size: 1.5rem;
  line-height: 1;
}
.ih-month-num .mono {
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
}
.ih-month .meter {
  height: 8px;
}

@media (max-width: 720px) {
  .ih {
    padding: var(--s-4) var(--s-4) var(--s-3);
    align-items: stretch;
    flex-direction: column;
    gap: var(--s-3);
  }
  .ih-endpoint {
    max-width: none;
  }
  .ih-title {
    font-size: 2.3rem;
  }
}
</style>
