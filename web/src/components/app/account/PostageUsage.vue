<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { useEmailAccount } from './useEmailAccount';

/** "Postage today": unlimited with a healthy key, otherwise today's count against our cap. */
const { loading, healthy, byok, used, limit, pct, left, digestAt } = useEmailAccount();
</script>

<template>
  <aside class="panel usage" aria-labelledby="rk-usage-title">
    <header class="panel-head">
      <p class="label muted">Postage today</p>
      <h2 id="rk-usage-title" class="h3">{{ healthy ? 'Your sender' : 'Our sender' }}</h2>
    </header>

    <div v-if="loading" class="usage-body" aria-hidden="true">
      <span class="skel skel-ink" style="width: 60%; height: 3.4rem"></span>
      <span class="skel" style="height: 14px"></span>
    </div>

    <div v-else-if="healthy" class="usage-body">
      <p class="big"><span class="big-n" aria-hidden="true">∞</span><span class="big-unit">Unlimited <span class="muted">(your Resend quota)</span></span></p>
      <ul class="facts" role="list">
        <li><Icon name="check" :size="16" /> No daily cap from us. Send as much as your Resend plan allows.</li>
        <li><Icon name="check" :size="16" /> Comes from <b class="mono">{{ byok?.from }}</b></li>
        <li><Icon name="check" :size="16" /> Daily digests still work, if you prefer them</li>
      </ul>
    </div>

    <div v-else class="usage-body">
      <p class="big">
        <span class="big-n">{{ used }}</span><span class="big-unit">of {{ limit }}<br />emails today</span>
      </p>
      <div
        class="meter"
        :class="{ 'is-high': pct >= 80 }"
        :style="{ '--pct': `${pct}%` }"
        role="meter"
        aria-label="Emails sent through our sender today"
        :aria-valuenow="used"
        aria-valuemin="0"
        :aria-valuemax="limit"
        :aria-valuetext="`${used} of ${limit} emails sent today`"
      ></div>
      <p class="small usage-line">{{ used }} of {{ limit }} instant emails today · {{ left }} left · resets 00:00 UTC</p>
      <div class="atcap">
        <p class="label">What happens at {{ limit }}</p>
        <ul class="facts" role="list">
          <li><Icon name="inbox" :size="16" /> Anything extra goes into the digest at {{ digestAt }}. Nothing is dropped.</li>
          <li><Icon name="send" :size="16" /> Discord, Slack, Telegram and webhooks don’t count. They’re always instant.</li>
          <li><Icon name="key" :size="16" /> Add your key and the cap disappears.</li>
        </ul>
      </div>
    </div>
  </aside>
</template>

<style scoped src="./account-panel.css"></style>
<style scoped>
.usage-body {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-5);
}
.big {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--s-3);
}
.big-n {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(4.5rem, 8vw, 6.5rem);
  line-height: 0.78;
  letter-spacing: -0.02em;
}
.big-unit {
  padding-bottom: 0.3rem;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: var(--track-label);
  line-height: 1.35;
}
.usage .meter {
  height: 18px;
}
.usage-line {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
.atcap {
  margin-top: var(--s-2);
  padding-top: var(--s-3);
  border-top: 1px dashed var(--line);
}
.atcap .facts {
  margin-top: var(--s-2);
}
.facts {
  display: grid;
  gap: var(--s-2);
  font-size: var(--fs-sm);
}
.facts li {
  display: grid;
  grid-template-columns: 1.4rem minmax(0, 1fr);
  align-items: start;
}
.facts :deep(svg) {
  margin-top: 0.2rem;
  color: var(--fg-muted);
}
@media (max-width: 1100px) {
  .usage {
    order: -1;
  }
}
@media (max-width: 560px) {
  .usage-body {
    padding: var(--s-4);
  }
}
</style>
