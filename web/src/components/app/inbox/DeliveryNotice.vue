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
      <p>
        Held for review because it looks like it’s collecting passwords or card details, or the form was reported. It wasn’t sent anywhere, and every value shows as
        <code>[held for review]</code> so nobody’s stolen details get passed on.
      </p>
      <p>Free form backends get abused for phishing, so held post can’t be released from the dashboard. You can still star it, or delete it if it isn’t something you expected.</p>
    </div>
  </div>
  <div v-else-if="s.status === 'spam'" class="notice det-notice" role="note">
    <span class="notice-icon"><Icon name="shield" :size="20" /></span>
    <p class="notice-title">Not delivered: filed as spam</p>
    <div class="notice-body">
      <p>Nothing was sent to email or your channels. Spam hangs about for {{ spamRetentionDays }} days in case we got it wrong, then it’s gone.</p>
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
      <p>This one looked a bit suspicious, so the visitor was asked to pass a quick Turnstile check. It’s delivered as soon as they do. If they never do, it was probably a bot.</p>
    </div>
  </div>
</template>

<style scoped>
.det-notice .notice-body p + p {
  margin-top: 0.5rem;
}
</style>
