<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { LIMITS, type Limits } from '@sendm8/shared';
import FormLoader from './FormLoader.vue';
import InboxApp from './InboxApp.vue';
import { loadEmailSettings, loadLimits } from '../../lib/api/store';

/** Build-time defaults until /api/me brings the deployment's real limits. */
const limits = ref<Limits>(LIMITS);
const digestHourUtc = ref(LIMITS.digestHourUtc);
onMounted(async () => {
  limits.value = await loadLimits().catch(() => LIMITS);
  digestHourUtc.value = (await loadEmailSettings().catch(() => null))?.digestHourUtc ?? limits.value.digestHourUtc;
});
</script>

<template>
  <FormLoader v-slot="{ form, channels, onFormUpdated }" title-template="{name} inbox" :crumb-index="1" variant="inbox">
    <InboxApp
      :form="form"
      :channels="channels"
      :digest-hour-utc="digestHourUtc"
      :spam-retention-days="limits.spamRetentionDays"
      :max-delivery-attempts="limits.maxDeliveryAttempts"
      @form-updated="onFormUpdated"
    />
  </FormLoader>
</template>
