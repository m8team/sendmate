<script setup lang="ts">
import Icon from '../ui/Icon.vue';
import type { Form } from '../../lib/api/types';
import { provideFormSettings, type FormSettingsProps } from './settings/useFormSettings';
import SettingsTabRail from './settings/SettingsTabRail.vue';
import GeneralPanel from './settings/GeneralPanel.vue';
import NotificationsPanel from './settings/NotificationsPanel.vue';
import ChannelsPanel from './settings/ChannelsPanel.vue';
import SpamPanel from './settings/SpamPanel.vue';
import DangerZonePanel from './settings/DangerZonePanel.vue';
import SaveBar from './settings/SaveBar.vue';

const props = defineProps<FormSettingsProps>();
const emit = defineEmits<{ 'form-updated': [form: Form] }>();

const { tab, current, status, zeroSignupAddress } = provideFormSettings(props, (form) => emit('form-updated', form));
</script>

<template>
  <div class="fs">
    <div v-if="status === 'pending_confirmation'" class="notice notice-warn fs-banner">
      <span class="notice-icon"><Icon name="clock" :size="20" /></span>
      <p class="notice-title">Waiting for confirmation</p>
      <div class="notice-body">
        <p>
          We sent a confirmation link to <b>{{ zeroSignupAddress ?? 'the address' }}</b>. Until it’s clicked, submissions are stored but not delivered. Check the spam folder if it’s
          not there.
        </p>
      </div>
    </div>
    <div v-else-if="status === 'disabled'" class="notice notice-signal fs-banner">
      <span class="notice-icon"><Icon name="lock" :size="20" /></span>
      <p class="notice-title">This form has been switched off</p>
      <div class="notice-body">
        <p>It isn’t taking submissions{{ current.flag ? ` (${current.flag})` : '' }}. You can still change settings, export and delete it.</p>
      </div>
    </div>

    <div class="fs-layout">
      <SettingsTabRail />

      <div class="fs-panels">
        <GeneralPanel v-show="tab === 'general'" />
        <NotificationsPanel v-show="tab === 'notifications'" />
        <ChannelsPanel v-show="tab === 'channels'" />
        <SpamPanel v-show="tab === 'spam'" />
        <DangerZonePanel v-show="tab === 'danger'" />
      </div>
    </div>

    <SaveBar />
  </div>
</template>

<style scoped>
.fs {
  position: relative;
}
.fs-banner {
  margin-bottom: var(--s-5);
}
.fs-layout {
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);
  gap: clamp(1.25rem, 3vw, 2.5rem);
  align-items: start;
}
@media (max-width: 860px) {
  .fs-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-4);
  }
}
</style>
