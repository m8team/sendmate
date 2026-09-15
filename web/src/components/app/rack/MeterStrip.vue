<script setup lang="ts">
/** The franking-meter strip: four tiles for this month, today's emails, spam binned and unread post. */
import { fmtN, type RackSummary } from './rackRows';

defineProps<{ loading: boolean; summary: RackSummary }>();
</script>

<template>
  <section class="meter-strip" aria-label="This month at a glance">
    <div class="ms-cell">
      <p class="label ms-label">Submissions this month</p>
      <p class="ms-num tabular"><span v-if="loading" class="skel skel-ink" style="width: 5rem; height: 2.6rem"></span><template v-else>{{ fmtN(summary.monthTotal) }}</template></p>
      <p class="ms-note">across {{ summary.formCount }} {{ summary.formCount === 1 ? 'form' : 'forms' }}, {{ fmtN(summary.perFormLimit) }} allowed per form</p>
    </div>
    <div class="ms-cell">
      <p class="label ms-label">Emails sent today</p>
      <template v-if="summary.byok">
        <p class="ms-num tabular">∞</p>
        <p class="ms-note">You’re on your own Resend key, so there’s no cap from us.</p>
      </template>
      <template v-else>
        <p class="ms-num tabular">
          <span v-if="loading || !summary.emailLoaded" class="skel skel-ink" style="width: 4rem; height: 2.6rem"></span>
          <template v-else>{{ summary.emailsToday }}<span class="ms-of">/{{ summary.emailLimit }}</span></template>
        </p>
        <span
          class="meter"
          :class="{ 'is-high': summary.emailPct > 80 }"
          :style="{ '--pct': `${summary.emailPct}%` }"
          role="img"
          :aria-label="`${summary.emailPct}% of today's email allowance used`"
        ></span>
        <p class="ms-note">{{ summary.emailsLeft }} left, then it’s the {{ summary.digestHour }} digest. <a href="/app/account/email">Add your Resend key</a> for no cap.</p>
      </template>
    </div>
    <div class="ms-cell">
      <p class="label ms-label">Spam binned</p>
      <p class="ms-num tabular">
        <span v-if="loading || summary.spamTotal === null" class="skel skel-ink" style="width: 3rem; height: 2.6rem"></span><template v-else>{{ fmtN(summary.spamTotal) }}</template>
      </p>
      <p class="ms-note">caught and kept out of your inbox, never delivered. Binned after {{ summary.spamRetentionDays }} days.</p>
    </div>
    <div class="ms-cell ms-cell-unread">
      <p class="label ms-label">Waiting to be read</p>
      <p class="ms-num tabular">{{ loading ? '··' : `${summary.unreadTotal}${summary.unreadMore ? '+' : ''}` }}</p>
      <p class="ms-note">{{ summary.unreadTotal === 0 ? 'All caught up. Put the kettle on.' : 'Go on, somebody wants a reply.' }}</p>
    </div>
  </section>
</template>

<style scoped>
.meter-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: var(--bw-strong) solid var(--line-strong);
  background: var(--bg-raised);
  margin-bottom: var(--s-7);
}
.ms-cell {
  display: grid;
  align-content: start;
  gap: 0.4rem;
  padding: var(--s-4) var(--s-4) var(--s-4);
  min-width: 0;
}
.ms-cell + .ms-cell {
  border-left: 1px dashed var(--line);
}
.ms-label {
  color: var(--fg-muted);
}
.ms-num {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(2.4rem, 3.6vw, 3.4rem);
  line-height: 0.9;
  letter-spacing: -0.01em;
}
.ms-of {
  font-size: 0.5em;
  font-weight: 700;
  color: var(--fg-muted);
  margin-left: 0.1em;
}
.ms-note {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
  line-height: 1.4;
}
.ms-note a {
  color: var(--signal-text);
  font-weight: 600;
}
.ms-cell .meter {
  height: 10px;
  margin-block: 0.15rem 0.1rem;
}
.ms-cell-unread {
  background: var(--accent);
  color: var(--on-accent);
  --fg-muted: var(--ink-600);
}

@media (max-width: 760px) {
  .meter-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ms-cell:nth-child(3) {
    border-left: 0;
  }
  .ms-cell:nth-child(n + 3) {
    border-top: 1px dashed var(--line);
  }
  .ms-num {
    font-size: 2.4rem;
  }
}
</style>
