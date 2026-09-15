<script setup lang="ts">
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { EmailAddressDto } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { countdown, resendCooldownLeft } from '../../../lib/api/adapters';
import { errorCode, friendlyError } from '../../../lib/api/errors';
import { toast } from '../../../lib/toast';
import { dayMonth } from '../InboxUtils';
import { checkNewAddress, isAccountAddress } from './resendRules';
import { useEmailAccount } from './useEmailAccount';

/** Recipients: every address a form can email, each verified once by its inbox. */
const { loading, me, addresses } = useEmailAccount();

const resend = reactive<Record<string, 'idle' | 'sending' | 'sent'>>({});
const recipErrors = reactive<Record<string, string>>({});
const removingAddr = ref<string | null>(null);
const newAddress = ref('');
const newAddressError = ref('');
const adding = ref(false);

const isLogin = (a: EmailAddressDto) => isAccountAddress(a, me.value?.user.email);
const sinceLabel = (t: number | null) => (t ? dayMonth(t) : '');
const refetch = () => api.listEmails().catch(() => addresses.value);

function patchAddress(next: EmailAddressDto) {
  addresses.value = addresses.value.map((a) => (a.id === next.id ? next : a));
}

/* A ticking clock for resend countdowns, only while one is running. */
const tick = ref(Date.now());
let tickTimer = 0;
const cooldownLeft = (a: EmailAddressDto) => resendCooldownLeft(a, tick.value);
watch(
  () => addresses.value.some((a) => resendCooldownLeft(a, tick.value) > 0),
  (running) => {
    window.clearInterval(tickTimer);
    if (running) tickTimer = window.setInterval(() => (tick.value = Date.now()), 1000);
  },
);
onBeforeUnmount(() => window.clearInterval(tickTimer));

async function resendVerification(a: EmailAddressDto) {
  if (resend[a.id] === 'sending' || cooldownLeft(a) > 0) return;
  resend[a.id] = 'sending';
  recipErrors[a.id] = '';
  try {
    const updated = await api.resendEmail(a.id);
    tick.value = Date.now();
    patchAddress({ ...updated, verificationSentAt: Math.max(updated.verificationSentAt ?? 0, Date.now() - 1000) });
    resend[a.id] = 'sent';
    toast(`Verification link sent to ${a.email}.`);
  } catch (err) {
    resend[a.id] = 'idle';
    if (errorCode(err) === 'resend_cooldown') {
      toast(friendlyError(err));
      // Our clock and the server's disagree: fetch the real send time for the countdown.
      addresses.value = await refetch();
    } else if (errorCode(err) === 'already_verified') {
      addresses.value = await refetch();
    } else {
      recipErrors[a.id] = friendlyError(err);
    }
  }
}

async function addAddress() {
  if (adding.value) return;
  const v = newAddress.value.trim();
  newAddressError.value = checkNewAddress(v);
  if (newAddressError.value) return nextTick(() => document.getElementById('rk-new-address')?.focus());
  adding.value = true;
  try {
    const a = await api.addEmail(v);
    tick.value = Date.now();
    addresses.value = [...addresses.value, a.verified ? a : { ...a, verificationSentAt: a.verificationSentAt ?? Date.now() }];
    newAddress.value = '';
    if (!a.verified) resend[a.id] = 'sent';
    toast(a.verified ? `${a.email} added.` : `Check ${a.email} for a verification link.`);
  } catch (err) {
    newAddressError.value = friendlyError(err);
    // The address is kept even if the email failed to send, so show it.
    if (errorCode(err) === 'email_budget_exhausted' || errorCode(err) === 'email_send_failed') addresses.value = await refetch();
    nextTick(() => document.getElementById('rk-new-address')?.focus());
  } finally {
    adding.value = false;
  }
}

async function removeAddress(a: EmailAddressDto) {
  if (removingAddr.value) return;
  removingAddr.value = a.id;
  try {
    await api.deleteEmail(a.id);
    addresses.value = addresses.value.filter((x) => x.id !== a.id);
    toast(`Removed ${a.email}. Email channels sending there have stopped.`);
  } catch (err) {
    recipErrors[a.id] = friendlyError(err);
  } finally {
    removingAddr.value = null;
  }
}
</script>

<template>
  <section class="panel recips" aria-labelledby="rk-recips-title">
    <header class="panel-head recips-head">
      <div>
        <p class="label muted">Recipients</p>
        <h2 id="rk-recips-title" class="h3">Addresses we can deliver to</h2>
      </div>
      <p class="muted small">Every inbox has to say yes once, so nobody can point a form at someone else’s email. The address you signed in with is already verified.</p>
    </header>
    <ul class="recip-list" role="list" :aria-busy="loading ? 'true' : undefined">
      <li v-if="loading" class="recip" aria-hidden="true">
        <span class="skel" style="width: 1.2rem; height: 1.2rem"></span>
        <span class="skel" style="width: 60%; height: 0.8rem"></span>
      </li>
      <li v-for="r in addresses" :key="r.id" class="recip">
        <span class="recip-icon" aria-hidden="true"><Icon name="mail" :size="18" /></span>
        <span class="recip-email mono">{{ r.email }}</span>
        <span class="recip-status">
          <span v-if="r.verified" class="tag tag-ok">Verified{{ r.verifiedAt ? ` ${sinceLabel(r.verifiedAt)}` : '' }}{{ isLogin(r) ? ' · your login' : '' }}</span>
          <span v-else class="tag tag-warn">Waiting for a click</span>
        </span>
        <span class="recip-action">
          <span v-if="recipErrors[r.id]" class="small field-error" role="alert">{{ recipErrors[r.id] }}</span>
          <template v-else-if="!r.verified">
            <span v-if="cooldownLeft(r) > 0" class="small ok-text recip-cooldown">
              <Icon name="check" :size="14" /> Sent. Check that inbox. <span class="muted">Resend in <span class="mono tabular">{{ countdown(cooldownLeft(r)) }}</span></span>
            </span>
            <span v-else-if="resend[r.id] === 'sent' && !r.verificationSentAt" class="small ok-text"><Icon name="check" :size="14" /> Sent. Check that inbox.</span>
            <button v-else type="button" class="btn btn-outline btn-xs" :aria-disabled="resend[r.id] === 'sending' ? 'true' : undefined" @click="resendVerification(r)">
              <Icon name="refresh" :size="14" /> {{ resend[r.id] === 'sending' ? 'Sending…' : 'Resend verification' }}<span class="sr-only"> to {{ r.email }}</span>
            </button>
          </template>
          <button v-if="!isLogin(r)" type="button" class="btn btn-ghost btn-xs rk-remove" :aria-disabled="removingAddr === r.id ? 'true' : undefined" @click="removeAddress(r)">
            <Icon name="trash" :size="14" /><span class="sr-only">Remove {{ r.email }}</span>
          </button>
        </span>
      </li>
      <li class="recip recip-add">
        <span class="recip-icon" aria-hidden="true"><Icon name="plus" :size="18" /></span>
        <form class="recip-form" novalidate @submit.prevent="addAddress">
          <label class="sr-only" for="rk-new-address">Add an address</label>
          <input
            id="rk-new-address"
            v-model="newAddress"
            class="input"
            type="email"
            autocomplete="email"
            placeholder="hello@yourdomain.com"
            :aria-invalid="newAddressError ? 'true' : undefined"
            :aria-describedby="newAddressError ? 'rk-new-address-err' : undefined"
          />
          <button type="submit" class="btn btn-outline btn-sm" :aria-disabled="adding ? 'true' : undefined">{{ adding ? 'Sending…' : 'Add and verify' }}</button>
          <p v-if="newAddressError" id="rk-new-address-err" class="field-error"><Icon name="alert" :size="14" /> {{ newAddressError }}</p>
        </form>
      </li>
    </ul>
  </section>
</template>

<style scoped src="./account-panel.css"></style>
<style scoped>
.recips-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 26rem);
  gap: var(--s-2) var(--s-5);
  align-items: end;
}
.recip-list {
  display: grid;
}
.recip {
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) auto minmax(11rem, auto);
  align-items: center;
  gap: var(--s-3);
  padding: 0.7rem var(--s-5);
  border-bottom: 1px solid var(--line);
}
.recip:last-child {
  border-bottom: 0;
}
.recip-icon {
  display: grid;
  place-items: center;
  color: var(--fg-muted);
}
.recip-email {
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.recip-action {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--s-2);
  flex-wrap: wrap;
}
.ok-text {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--ok);
  font-weight: 600;
}
.rk-remove {
  color: var(--signal-text);
}
@media (max-width: 700px) {
  .recips-head {
    grid-template-columns: minmax(0, 1fr);
  }
  .recip {
    grid-template-columns: 1.5rem minmax(0, 1fr);
    padding-inline: var(--s-4);
  }
  .recip-status,
  .recip-action {
    grid-column: 2;
    justify-content: flex-start;
  }
}
/* After the 700px rule on purpose: the add row keeps its wider icon column. */
.recip-add {
  grid-template-columns: 2rem minmax(0, 1fr);
  background: var(--bg);
}
.recip-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  align-items: center;
}
.recip-form .input {
  flex: 1 1 14rem;
  min-width: 0;
}
.recip-form .field-error {
  flex-basis: 100%;
}
</style>
