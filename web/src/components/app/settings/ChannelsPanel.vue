<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import AddChannelForm from './AddChannelForm.vue';
import ChannelSlip from './ChannelSlip.vue';
import { useFormSettings } from './useFormSettings';

const { chans, limits, addChannel } = useFormSettings();
const { adding, checkInbox, openAdd, openAddEmail } = addChannel;
</script>

<template>
  <section id="fs-panel-channels" role="tabpanel" aria-labelledby="fs-tab-channels" tabindex="0" class="panel">
    <header class="panel-head">
      <h2 class="h3">Channels</h2>
      <p class="muted">Where submissions are delivered. Failed deliveries are retried up to {{ limits.maxDeliveryAttempts }} times.</p>
    </header>

    <p v-if="!chans.length" class="empty">No channels yet. Submissions are only saved to your inbox.</p>

    <div v-if="checkInbox" class="notice notice-accent fs-checkinbox" role="status">
      <span class="notice-icon"><Icon name="mail" :size="18" /></span>
      <p class="notice-title">Check your inbox</p>
      <div class="notice-body">
        <p>We sent a verification link to <b>{{ checkInbox }}</b>. Emails to it start once it’s clicked.</p>
      </div>
    </div>

    <ul class="slips" role="list">
      <ChannelSlip v-for="c in chans" :key="c.id" :channel="c" />
    </ul>

    <div v-if="!adding" class="addrow">
      <button id="fs-add-channel" type="button" class="btn btn-outline" @click="openAdd"><Icon name="plus" /> Add channel</button>
      <button id="fs-add-email" type="button" class="btn btn-outline" @click="openAddEmail"><Icon name="mail" /> Add email address</button>
    </div>

    <AddChannelForm v-else />
  </section>
</template>

<style scoped src="./settings-panel.css"></style>
<style scoped>
.slips {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-3);
  padding-bottom: var(--s-4);
}
.empty {
  padding-bottom: var(--s-4);
  color: var(--fg-muted);
}
.addrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}
.fs-checkinbox {
  margin-bottom: var(--s-4);
}
@media (max-width: 560px) {
  .addrow .btn {
    width: 100%;
  }
}
</style>
