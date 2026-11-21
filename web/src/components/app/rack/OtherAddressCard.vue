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
    <h2 id="oa-title" class="oa-title">Expecting a form here?</h2>
    <p v-if="sentTo" class="oa-body" role="status">
      We emailed <strong>{{ sentTo }}</strong> a link. Click it and any forms sending to that address move here.
    </p>
    <template v-else>
      <p class="oa-body">
        Forms made with an address in the URL (like <code>/f/hello@yourbusiness.com</code>) belong to that address. You’re signed in as <strong>{{ signedInAs }}</strong>. Add
        the other address to bring its forms here.
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
        <button type="submit" class="btn btn-outline btn-sm" :aria-disabled="busy ? 'true' : undefined">{{ busy ? 'Sending…' : 'Send link' }}</button>
      </form>
      <p v-if="error" id="oa-err" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
    </template>
  </section>
</template>

<style scoped>
.oa {
  display: grid;
  gap: var(--s-2);
  max-width: 40rem;
  margin-top: var(--s-6);
}
.oa-title {
  font-size: var(--fs-sm);
  font-weight: 600;
}
.oa-body {
  color: var(--fg-muted);
}
.oa-body strong {
  color: var(--fg);
  font-weight: 600;
}
.oa-form {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-1);
}
.oa-form .input {
  flex: 1;
  min-width: 0;
}
</style>
