<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { LIMITS, type Limits } from '@sendm8/shared';
import FormLoader from './FormLoader.vue';
import FormSettings from './FormSettings.vue';
import { limits } from '../../config/site';
import { loadForms, loadLimits } from '../../lib/api/store';
import { formIdFromPath } from '../../lib/api/session';
import type { Form } from '../../lib/api/types';

const statusTag: Record<Form['status'], { cls: string; text: string }> = {
  active: { cls: 'tag-ok', text: 'Active' },
  paused: { cls: 'tag-warn', text: 'Paused' },
  pending_confirmation: { cls: 'tag-warn', text: 'Waiting for confirmation' },
  disabled: { cls: 'tag-signal', text: 'Disabled' },
};

/** The pigeonhole number matches the form's position in the rail. */
const holeNo = ref('··');
onMounted(async () => {
  const id = formIdFromPath(location.pathname);
  try {
    const i = (await loadForms()).findIndex((f) => f.id === id);
    if (i >= 0) holeNo.value = String(i + 1).padStart(2, '0');
  } catch {
    /* just decoration */
  }
});

/** Build-time defaults until /api/me brings the deployment's effective limits. */
const toSettingsLimits = (l: Limits) => ({
  digestHourUtc: l.digestHourUtc,
  spamRetentionDays: l.spamRetentionDays,
  // Not a tunable limit in the API: the Worker's fixed outbound timeout.
  webhookTimeoutSeconds: limits.webhookTimeoutSeconds,
  ratePerIpPerMinute: l.burstPerIpPerFormPerMinute,
  ratePerFormPerMinute: l.burstPerFormPerMinute,
  maxDeliveryAttempts: l.maxDeliveryAttempts,
  instantEmailsPerDay: l.instantEmailsPerUserPerDay,
});
const settingsLimits = ref(toSettingsLimits(LIMITS));
onMounted(async () => {
  settingsLimits.value = toSettingsLimits(await loadLimits().catch(() => LIMITS));
});
</script>

<template>
  <FormLoader v-slot="{ form, channels, onFormUpdated }" title-template="Settings · {name}" :crumb-index="1" variant="settings">
    <header class="set-head">
      <div class="set-head-main">
        <p class="label set-kicker"><span class="bay-no">Settings</span> · Pigeonhole {{ holeNo }}</p>
        <h1 class="h2 set-title">{{ form.name }}</h1>
      </div>
      <div class="set-head-meta">
        <span class="tag" :class="statusTag[form.status].cls">{{ statusTag[form.status].text }}</span>
        <span class="mono set-id">{{ form.id }}</span>
      </div>
    </header>

    <FormSettings :form="form" :channels="channels" :limits="settingsLimits" @form-updated="onFormUpdated" />
  </FormLoader>
</template>

<style scoped>
.set-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--s-3) var(--s-5);
  margin-bottom: clamp(1.25rem, 3vw, 2.25rem);
  padding-bottom: var(--s-4);
  border-bottom: var(--bw-strong) solid var(--line-strong);
}
.set-head-main {
  min-width: 0;
}
.set-kicker {
  color: var(--fg-muted);
}
.set-title {
  margin-top: var(--s-2);
  overflow-wrap: anywhere;
}
.set-head-meta {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  flex-wrap: wrap;
}
.set-id {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
</style>
