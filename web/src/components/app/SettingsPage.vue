<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { Limits } from '@sendm8/shared';
import { LIMITS } from '../../config/limits';
import FormLoader from './FormLoader.vue';
import FormSettings from './FormSettings.vue';
import { limits } from '../../config/site';
import { loadLimits } from '../../lib/api/store';
import type { Form } from '../../lib/api/types';

const statusTag: Record<Form['status'], { cls: string; text: string }> = {
  active: { cls: 'tag-ok', text: 'Active' },
  paused: { cls: 'tag-warn', text: 'Paused' },
  pending_confirmation: { cls: 'tag-warn', text: 'Waiting for confirmation' },
  disabled: { cls: 'tag-signal', text: 'Disabled' },
};

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
  <FormLoader v-slot="{ form, channels, rev, onFormUpdated }" title-template="Settings · {name}" :crumb-index="1" variant="settings">
    <header class="app-head">
      <div>
        <h1 class="app-title">Settings</h1>
        <p class="app-sub">
          {{ form.name }}
          <span v-if="form.status !== 'active'" class="tag" :class="statusTag[form.status].cls">{{ statusTag[form.status].text }}</span>
        </p>
      </div>
    </header>
    <FormSettings :key="rev" :form="form" :channels="channels" :limits="settingsLimits" @form-updated="onFormUpdated" />
  </FormLoader>
</template>


