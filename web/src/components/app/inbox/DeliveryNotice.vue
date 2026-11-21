<script setup lang="ts">
/** Why a submission wasn't delivered: held for review, filed as spam, or waiting for a captcha. */
import Icon from '../../ui/Icon.vue';
import type { Submission } from '../../../lib/api/types';

defineProps<{ s: Submission; spamRetentionDays: number }>();
const emit = defineEmits<{ release: [] }>();
</script>

<template>
  <div v-if="s.status === 'held'" class="notice notice-warn det-notice" role="note">
    <span class="notice-icon"><Icon name="alert" :size="20" /></span>
    <p class="notice-title">Held for review</p>
    <div class="notice-body">
      <p>It looks like it’s collecting passwords or card details, so it wasn’t delivered and its contents are hidden. Held submissions can’t be released.</p>
    </div>
  </div>
  <div v-else-if="s.status === 'spam'" class="notice det-notice" role="note">
    <span class="notice-icon"><Icon name="shield" :size="20" /></span>
    <p class="notice-title">Marked as spam</p>
    <div class="notice-body">
      <p>It wasn’t delivered, and it’s deleted after {{ spamRetentionDays }} days.</p>
      <p>
        <button type="button" class="btn btn-outline btn-sm" @click="emit('release')">
          <Icon name="check" :size="16" /> {{ s.deliveries.length ? 'Not spam, move to inbox' : 'Not spam, deliver it' }}
        </button>
      </p>
    </div>
  </div>
  <div v-else-if="s.status === 'pending_challenge'" class="notice notice-warn det-notice" role="note">
    <span class="notice-icon"><Icon name="clock" :size="20" /></span>
    <p class="notice-title">Waiting for a captcha</p>
    <div class="notice-body">
      <p>The visitor was asked to pass a captcha. It’s delivered when they do.</p>
    </div>
  </div>
</template>

<style scoped>
.det-notice .notice-body p + p {
  margin-top: 0.5rem;
}
</style>
