<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { useFormSettings } from './useFormSettings';

/** Today's instant-email meter, or "unlimited" when the account sends with its own Resend key. */
const { emailSettings, budget } = useFormSettings();
const { used, emailLimit, byok, simulating, pct, overCap, digestAt, toggleCapPreview } = budget;
</script>

<template>
  <div class="row-control budget">
    <template v-if="!emailSettings">
      <span class="skel" style="height: 1rem; width: 60%"></span>
      <span class="skel" style="height: 18px"></span>
    </template>
    <template v-else-if="byok">
      <p class="budget-big"><span>∞</span> Unlimited <span class="muted">(your Resend quota)</span></p>
      <p class="field-hint">You’re sending with your own Resend key, so there’s no cap from us.</p>
    </template>
    <template v-else>
      <div class="budget-row mono">
        <span><b>{{ used }}</b> of {{ emailLimit }} used today</span>
        <span :class="overCap ? 'tag tag-warn' : 'tag tag-ok'">{{ overCap ? 'At the cap' : `${emailLimit - used} left` }}</span>
      </div>
      <div
        class="meter"
        :class="{ 'is-high': pct >= 80 }"
        :style="{ '--pct': `${pct}%` }"
        role="meter"
        aria-label="Instant emails used today"
        :aria-valuenow="used"
        aria-valuemin="0"
        :aria-valuemax="emailLimit"
        :aria-valuetext="`${used} of ${emailLimit}`"
      ></div>
      <div v-if="overCap" class="notice notice-warn budget-notice" role="status">
        <span class="notice-icon"><Icon name="clock" :size="18" /></span>
        <p class="notice-title">Switched to digest for today</p>
        <div class="notice-body">
          <p>
            {{ used }} of {{ emailLimit }} instant emails used today, the rest arrive in the digest at {{ digestAt }}.
            <a class="link-signal" href="/app/account/email">Add your Resend key to go unlimited</a>.
          </p>
        </div>
      </div>
      <div class="budget-foot">
        <a class="link-signal" href="/app/account/email">Go unlimited with your own Resend key</a>
        <button type="button" class="btn btn-ghost btn-xs" :aria-pressed="simulating" @click="toggleCapPreview">
          {{ simulating ? 'Back to real usage' : 'Preview what happens at the cap' }}
        </button>
      </div>
    </template>
    <p v-if="emailSettings?.byok.configured && !emailSettings.byok.healthy" class="notice notice-signal">
      <span class="notice-icon"><Icon name="alert" :size="18" /></span>
      <span class="notice-body">Resend rejected your key, so emails are waiting for the digest. <a class="link-signal" href="/app/account/email">Fix it</a>.</span>
    </p>
  </div>
</template>

<style scoped>
.budget-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-3);
  font-size: var(--fs-sm);
}
.budget .meter {
  height: 18px;
}
.budget-notice {
  margin-top: var(--s-2);
}
.budget-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
  font-size: var(--fs-sm);
}
.budget-big {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--s-2);
  font-weight: 700;
}
.budget-big span:first-child {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: 3rem;
  line-height: 0.8;
}
</style>
