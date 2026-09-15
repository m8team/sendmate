<script setup lang="ts">
import Icon from '../ui/Icon.vue';
import { provideEmailAccount } from './account/useEmailAccount';
import ResendKeyPanel from './account/ResendKeyPanel.vue';
import PostageUsage from './account/PostageUsage.vue';
import EmailAddresses from './account/EmailAddresses.vue';

const { loadError, load } = provideEmailAccount();
</script>

<template>
  <div class="rk">
    <div v-if="loadError" class="notice notice-signal rk-load" role="alert">
      <span class="notice-icon"><Icon name="alert" :size="18" /></span>
      <p class="notice-title">Couldn’t load your email settings</p>
      <div class="notice-body">
        <p>{{ loadError }}</p>
        <p><button type="button" class="btn btn-outline btn-sm" @click="load"><Icon name="refresh" :size="16" /> Try again</button></p>
      </div>
    </div>

    <div class="rk-grid">
      <ResendKeyPanel />
      <PostageUsage />
    </div>

    <EmailAddresses />
  </div>
</template>

<style scoped>
.rk {
  display: grid;
  gap: var(--s-5);
}
.rk-grid {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(17rem, 4fr);
  gap: var(--s-5);
  align-items: start;
}
@media (max-width: 1100px) {
  .rk-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.rk-load {
  margin-bottom: var(--s-5);
}
</style>
