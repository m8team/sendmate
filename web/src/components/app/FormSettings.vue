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
        <p>We sent a link to <b>{{ zeroSignupAddress ?? 'the address' }}</b>. Until it’s clicked, submissions are saved but not delivered.</p>
      </div>
    </div>
    <div v-else-if="status === 'disabled'" class="notice notice-signal fs-banner">
      <span class="notice-icon"><Icon name="lock" :size="20" /></span>
      <p class="notice-title">This form has been switched off</p>
      <div class="notice-body">
        <p>It isn’t taking submissions{{ current.flag ? ` (${current.flag})` : '' }}.</p>
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
  gap: var(--s-5);
}
</style>
