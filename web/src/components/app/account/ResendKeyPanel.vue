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
      <p class="label muted">Option B · bring your own stamps</p>
      <h2 id="rk-key-title" class="h3">Your Resend key</h2>
    </header>

    <div v-if="loading" class="keyform" aria-hidden="true">
      <span class="skel" style="width: 8rem; height: 0.7rem"></span>
      <span class="skel" style="height: 2.75rem"></span>
      <span class="skel" style="width: 70%; height: 0.7rem"></span>
      <span class="skel" style="width: 12rem; height: 2.75rem"></span>
    </div>

    <ResendConnected v-else-if="connected && byok" :byok="byok" />

    <ResendKeyForm v-else />

    <div class="security">
      <h3 class="label security-title"><Icon name="lock" :size="14" /> How we look after it</h3>
      <ul role="list">
        <li>Encrypted with AES-256-GCM before it touches the database.</li>
        <li>Never shown in full again, not even to you. You’ll only ever see the last four characters.</li>
        <li>Only used to send your own notifications.</li>
        <li>
          If it stops working (revoked, or you hit your Resend limit), we don’t quietly switch to our sender. Notifications wait for the digest and you’ll see a
          banner here.
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped src="./account-panel.css"></style>
<style scoped>
.keyform {
  display: grid;
  gap: var(--s-4);
  padding: var(--s-5);
}
.security {
  margin: 0 var(--s-5) var(--s-5);
  padding: var(--s-4);
  background: var(--bg-sunk);
  border: 1px solid var(--line);
}
.security-title {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
.security ul {
  display: grid;
  gap: 0.35rem;
  margin-top: var(--s-3);
  font-size: var(--fs-sm);
}
.security li {
  position: relative;
  padding-left: 1.1rem;
}
.security li::before {
  content: '—';
  position: absolute;
  left: 0;
  color: var(--fg-muted);
}
@media (max-width: 560px) {
  .keyform {
    padding: var(--s-4);
  }
  .security {
    margin: 0 var(--s-4) var(--s-4);
  }
}
</style>
