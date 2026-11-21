<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import ResendConnected from './ResendConnected.vue';
import ResendKeyForm from './ResendKeyForm.vue';
import { useEmailAccount } from './useEmailAccount';

/** Option B: the account's own Resend key, connected or waiting to be pasted in. */
const { loading, byok, resendKey } = useEmailAccount();
const { connected } = resendKey;
</script>

<template>
  <section class="panel keypanel" aria-labelledby="rk-key-title" :aria-busy="loading ? 'true' : undefined">
    <header class="panel-head">
      <h2 id="rk-key-title" class="h3">Your own Resend key</h2>
      <p>Removes the daily limit and sends from your own domain.</p>
    </header>

    <div v-if="loading" class="keyform" aria-hidden="true">
      <span class="skel" style="width: 8rem; height: 0.7rem"></span>
      <span class="skel" style="height: 2.75rem"></span>
      <span class="skel" style="width: 70%; height: 0.7rem"></span>
      <span class="skel" style="width: 12rem; height: 2.75rem"></span>
    </div>

    <ResendConnected v-else-if="connected && byok" :byok="byok" />

    <ResendKeyForm v-else />

    <p class="security"><Icon name="lock" :size="13" /> Stored encrypted. Only the last four characters are ever shown.</p>
  </section>
</template>

<style scoped src="./account-panel.css"></style>
<style scoped>
.keyform {
  display: grid;
  gap: var(--s-4);
}
.security {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
</style>
