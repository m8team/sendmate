<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import AddChannelForm from './AddChannelForm.vue';
import ChannelSlip from './ChannelSlip.vue';
import { useFormSettings } from './useFormSettings';

const { chans, limits, addChannel } = useFormSettings();
const { adding, checkInbox, openAdd } = addChannel;
</script>

<template>
  <section id="fs-panel-channels" role="tabpanel" aria-labelledby="fs-tab-channels" tabindex="0" class="panel">
    <header class="panel-head">
      <h2 class="h3">Channels</h2>
      <p class="muted">Everywhere a submission gets delivered. Free and unlimited, apart from email. Failed deliveries are retried up to {{ limits.maxDeliveryAttempts }} times.</p>
    </header>

    <p v-if="!chans.length" class="empty">No channels. Submissions still land in your dashboard inbox, but nobody gets a ping.</p>

    <div v-if="checkInbox" class="notice notice-accent fs-checkinbox" role="status">
      <span class="notice-icon"><Icon name="mail" :size="18" /></span>
      <p class="notice-title">Check your inbox</p>
      <div class="notice-body">
        <p>We sent a verification link to <b class="mono">{{ checkInbox }}</b>. Emails to it wait until it’s clicked. Everything still lands in your inbox meanwhile.</p>
      </div>
    </div>

    <ul class="slips" role="list">
      <ChannelSlip v-for="c in chans" :key="c.id" :channel="c" />
    </ul>

    <button v-if="!adding" id="fs-add-channel" type="button" class="btn btn-outline addbtn" @click="openAdd"><Icon name="plus" /> Add channel</button>

    <AddChannelForm v-else />
  </section>
</template>

<style scoped src="./settings-panel.css"></style>
<style scoped>
.slips {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--s-3);
  padding: var(--s-5);
}
.empty {
  padding: var(--s-5) var(--s-5) 0;
  color: var(--fg-muted);
}
.addbtn {
  margin: 0 var(--s-5) var(--s-5);
}
.fs-checkinbox {
  margin: var(--s-5) var(--s-5) 0;
}
@media (max-width: 560px) {
  .slips {
    padding: var(--s-3);
  }
  .addbtn {
    margin: 0 var(--s-3) var(--s-4);
    width: calc(100% - var(--s-3) * 2);
  }
}
</style>
