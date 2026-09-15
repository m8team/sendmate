<script setup lang="ts">
import { computed } from 'vue';
import { digestLabel, n, type CalcLimits, type Estimate, type Mode } from './calcLogic';

const props = defineProps<{ result: Estimate; mode: Mode; limits: CalcLimits }>();

const cap = computed(() => props.limits.emailsPerDay);
const monthCap = computed(() => props.limits.submissionsPerFormPerMonth);
const digestAt = computed(() => digestLabel(props.limits.digestHourUtc));
</script>

<template>
  <div class="receipt perf-bottom">
    <p class="receipt-top">
      <span class="caps-wide">Counter receipt</span>
      <span class="label muted">Estimate · typical day</span>
    </p>
    <dl class="lines mono">
      <div class="line">
        <dt>Submissions a day, all forms</dt>
        <dd>{{ n(result.total) }}</dd>
      </div>
      <div class="line">
        <dt>Dashboard inbox</dt>
        <dd>{{ n(result.total) }}</dd>
      </div>
      <div class="line">
        <dt>Discord · Slack · webhooks</dt>
        <dd>{{ n(result.total) }}</dd>
      </div>
      <div class="line line-meter">
        <dt>{{ mode === 'byok' ? 'Emails via your Resend key' : 'Emails sent instantly' }}</dt>
        <dd>
          <template v-if="mode === 'ours'">{{ n(result.instant) }} / {{ n(cap) }}</template>
          <template v-else>{{ n(result.instant) }}</template>
        </dd>
        <div
          v-if="mode === 'ours'"
          class="meter"
          :class="{ 'is-high': result.total > cap }"
          :style="{ '--pct': `${result.emailPct}%` }"
          aria-hidden="true"
        ></div>
      </div>
      <div class="line" :class="{ 'is-flag': result.overflow > 0 }">
        <dt>Held for the {{ digestAt }} digest</dt>
        <dd>{{ n(result.overflow) }}</dd>
      </div>
      <div class="line line-meter" :class="{ 'is-flag': result.overMonth }">
        <dt>Per form, a month</dt>
        <dd>{{ n(result.perMonth) }} / {{ n(monthCap) }}</dd>
        <div class="meter" :class="{ 'is-high': result.overMonth }" :style="{ '--pct': `${result.monthPct}%` }" aria-hidden="true"></div>
      </div>
    </dl>
    <p class="receipt-total">
      <span class="label">Postage due</span>
      <span class="receipt-sum">0.00</span>
    </p>
  </div>
</template>

<style scoped>
.receipt {
  --perf-size: 6px;
  --perf-gap: 16px;
  padding: var(--s-5) var(--s-5) calc(var(--s-6) + 6px);
  background: var(--bg-sunk);
  border-top: 2px solid var(--line-strong);
}
.receipt-top {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--s-2) var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 2px dashed var(--line);
}
.receipt-top .caps-wide {
  font-size: var(--fs-sm);
}
.lines {
  font-size: var(--fs-xs);
}
.line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem var(--s-3);
  padding-block: 0.6rem;
  border-bottom: 1px dotted var(--line);
}
.line dt {
  color: var(--fg-muted);
}
.line dd {
  margin: 0;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.line .meter {
  grid-column: 1 / -1;
  height: 10px;
}
.line.is-flag dt,
.line.is-flag dd {
  color: var(--signal-text);
}
.receipt-total {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: var(--s-3);
  padding-top: var(--s-4);
}
.receipt-sum {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: 3rem;
  line-height: 0.8;
}

@media (max-width: 420px) {
  .receipt {
    padding-inline: var(--s-4);
  }
}
</style>
