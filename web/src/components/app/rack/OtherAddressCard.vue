<script setup lang="ts">
/**
 * Shown on an empty rack. People often make an email-endpoint form for one address (hello@theirbusiness)
 * and sign in with another (their Gmail), then find an empty dashboard. Forms belong to the address in
 * their URL, so this lets them add and verify that address here; verifying it moves its forms in.
 */
import { ref } from 'vue';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { invalidate } from '../../../lib/api/store';
import { addFormAddress } from '../../../lib/otherAddress';

defineProps<{ signedInAs: string }>();
const emit = defineEmits<{ claimed: [] }>();

const email = ref('');
const busy = ref(false);
const error = ref('');
const sentTo = ref('');

async function add() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await addFormAddress(email.value, api.addEmail);
    if (result.kind === 'invalid') {
      error.value = result.message;
      return;
    }
    invalidate('email-settings');
    if (result.kind === 'claimed') {
      invalidate('me');
      emit('claimed');
    } else {
      sentTo.value = result.email;
    }
  } catch (err) {
    error.value = friendlyError(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="oa" aria-labelledby="oa-title">
    <p class="label oa-kicker">Expecting a form here?</p>
    <h2 id="oa-title" class="oa-title">It might be sending to a different address.</h2>

    <p v-if="sentTo" class="oa-sent" role="status">
      <Icon name="mail" :size="18" /> We’ve emailed <strong class="mono">{{ sentTo }}</strong> a link. Click it, and any forms that send to that address
      move into this dashboard, along with their submissions.
    </p>

    <template v-else>
      <p class="oa-body">
        A form made by putting an address in its URL, like <code>/f/hello@yourbusiness.com</code>, belongs to that address. You’re signed in as
        <strong>{{ signedInAs }}</strong>. If your form uses another address, add it here and click the link we send it.
      </p>
      <form class="oa-form" novalidate @submit.prevent="add">
        <label class="sr-only" for="oa-email">The address your form sends to</label>
        <input
          id="oa-email"
          v-model="email"
          class="input"
          type="email"
          autocomplete="email"
          placeholder="hello@yourbusiness.com"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? 'oa-err' : undefined"
        />
        <button type="submit" class="btn btn-signal" :aria-disabled="busy ? 'true' : undefined">
          <Icon :name="busy ? 'clock' : 'mail'" :size="16" /> {{ busy ? 'Sending…' : 'Send the link' }}
        </button>
      </form>
      <p v-if="error" id="oa-err" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
    </template>
  </section>
</template>

<style scoped>
.oa {
  display: grid;
  gap: var(--s-3);
  margin-bottom: var(--s-6);
  padding: var(--s-4) var(--s-5);
  border: var(--bw-strong) solid var(--line-strong);
  border-left: 6px solid var(--accent);
  background: var(--bg-raised);
}
.oa-kicker {
  color: var(--fg-muted);
}
.oa-title {
  font-family: var(--font-display);
  font-stretch: var(--stretch-semi);
  font-weight: 800;
  font-size: clamp(1.25rem, 2.2vw, 1.6rem);
  line-height: 1.15;
}
.oa-body,
.oa-sent {
  max-width: 62ch;
  color: var(--fg-muted);
  line-height: 1.55;
}
.oa-body code {
  white-space: normal;
  overflow-wrap: anywhere;
}
.oa-sent {
  display: flex;
  gap: var(--s-2);
  align-items: start;
  color: var(--fg);
}
.oa-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  max-width: 36rem;
}
.oa-form .input {
  flex: 1 1 16rem;
  min-width: 0;
}
</style>
