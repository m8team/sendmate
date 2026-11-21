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
      <p>No limit: you’re sending with your own Resend key.</p>
    </template>
    <template v-else>
      <div class="budget-row">
        <span class="tabular">{{ used }} of {{ emailLimit }} used today</span>
        <span v-if="overCap" class="tag tag-warn">Limit reached</span>
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
        <p class="notice-title">Sending the digest for the rest of today</p>
        <div class="notice-body">
          <p>New emails arrive in the {{ digestAt }} digest.</p>
        </div>
      </div>
      <div class="budget-foot">
        <a href="/app/account/email">Remove the limit with your own Resend key</a>
        <button type="button" class="btn btn-ghost btn-xs" :aria-pressed="simulating" @click="toggleCapPreview">
          {{ simulating ? 'Show real usage' : 'Preview the limit' }}
        </button>
      </div>
    </template>
    <p v-if="emailSettings?.byok.configured && !emailSettings.byok.healthy" class="notice notice-signal">
      <span class="notice-icon"><Icon name="alert" :size="18" /></span>
      <span class="notice-body">Resend rejected your key, so emails wait for the digest. <a href="/app/account/email">Fix it</a></span>
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
</style>
