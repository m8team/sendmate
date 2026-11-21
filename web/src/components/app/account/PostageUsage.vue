<script setup lang="ts">
import { useEmailAccount } from './useEmailAccount';

/** Today's email count against the daily limit, or "no limit" with a healthy key of your own. */
const { loading, healthy, byok, used, limit, pct, digestAt } = useEmailAccount();
</script>

<template>
  <section class="panel usage" aria-labelledby="rk-usage-title">
    <header class="panel-head">
      <h2 id="rk-usage-title" class="h3">Daily email limit</h2>
      <p>Shared by all your forms. Resets at 00:00 UTC.</p>
    </header>

    <div v-if="loading" class="usage-body" aria-hidden="true">
      <span class="skel" style="width: 40%; height: 0.9rem"></span>
      <span class="skel" style="height: 6px"></span>
    </div>

    <div v-else-if="healthy" class="usage-body">
      <p>No limit. Emails go through your own Resend account from <b>{{ byok?.from }}</b>.</p>
    </div>

    <div v-else class="usage-body">
      <p class="tabular">{{ used }} of {{ limit }} sent today</p>
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
      <p class="usage-note">After {{ limit }}, emails wait for the {{ digestAt }} digest. Discord, Slack, Telegram and webhooks don’t count.</p>
    </div>
  </section>
</template>

<style scoped src="./account-panel.css"></style>
<style scoped>
.usage-body {
  display: grid;
  gap: var(--s-2);
}
.usage-note {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
</style>
