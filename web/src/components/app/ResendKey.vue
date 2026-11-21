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

    <EmailAddresses />
    <PostageUsage />
    <ResendKeyPanel />
  </div>
</template>

<style scoped>
.rk-load {
  margin-bottom: var(--s-5);
}
</style>
