<script setup lang="ts">
/** Why the form isn't taking (or delivering) post: awaiting confirmation, switched off, or paused, with the resume switch. */
import { ref } from 'vue';
import type { Form } from '../../../lib/api/types';
import { api } from '../../../lib/api/endpoints';
import { toForm } from '../../../lib/api/adapters';
import { friendlyError } from '../../../lib/api/errors';
import { announceFormsChanged } from '../../../lib/api/store';
import { toast } from '../../../lib/toast';
import { ago } from '../InboxUtils';
import { emailAddressOf } from './formStatus';
import InboxBanner from './InboxBanner.vue';

const props = defineProps<{ form: Form; now: number }>();
const formStatus = defineModel<Form['status']>('formStatus', { required: true });
const emit = defineEmits<{ 'form-updated': [form: Form] }>();

/** Once paused, the banner stays (as "Back in business") after resuming. */
const wasPaused = props.form.status === 'paused';
const pauseBusy = ref(false);

async function togglePaused(e: Event) {
  const input = e.target as HTMLInputElement;
  const on = input.checked;
  const prev = formStatus.value;
  formStatus.value = on ? 'active' : 'paused';
  pauseBusy.value = true;
  try {
    const dto = await api.updateForm(props.form.id, { status: on ? 'active' : 'paused' });
    emit('form-updated', toForm(dto, props.form.daily));
    announceFormsChanged();
    toast(on ? 'Resumed. The form is taking post again.' : 'Paused. New submissions get turned away.');
  } catch (err) {
    formStatus.value = prev;
    input.checked = prev === 'active';
    toast(`Couldn’t ${on ? 'resume' : 'pause'} the form: ${friendlyError(err)}`);
  } finally {
    pauseBusy.value = false;
  }
}
</script>

<template>
  <InboxBanner v-if="formStatus === 'pending_confirmation'" class="notice-warn" icon="mail" :title="`Waiting for ${emailAddressOf(form.emailEndpoint) ?? 'the address'} to confirm`">
    <p>
      Someone posted to this address, so we sent it a confirmation email {{ ago(form.createdAt, now) }}. Until the link in it gets clicked, submissions are stored here but
      <strong>nothing is delivered</strong>. Check the spam folder too, it likes to hide there.
    </p>
  </InboxBanner>
  <InboxBanner v-else-if="formStatus === 'disabled'" class="notice-signal" icon="lock" title="This form has been switched off">
    <p>It isn’t taking submissions{{ form.flag ? ` (${form.flag})` : '' }}. Everything below is still yours to read, export or delete.</p>
  </InboxBanner>
  <InboxBanner
    v-else-if="wasPaused || formStatus === 'paused'"
    :class="formStatus === 'active' ? 'notice-ok' : ''"
    :icon="formStatus === 'active' ? 'play' : 'pause'"
    :title="formStatus === 'active' ? 'Back in business' : 'This form is paused'"
  >
    <p v-if="formStatus === 'active'">New submissions will land here again. Nothing sent while it was paused was kept, sorry, those visitors got a “form paused” error.</p>
    <p v-else>New submissions are turned away with an HTTP 423 and aren’t stored. Everything below arrived before you paused it.</p>
    <label class="banner-switch">
      <input type="checkbox" role="switch" class="switch" :checked="formStatus === 'active'" :disabled="pauseBusy" @change="togglePaused" />
      <span>{{ formStatus === 'active' ? 'Accepting submissions' : 'Resume the form' }}</span>
    </label>
  </InboxBanner>
</template>

<style scoped>
.banner-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-weight: 600;
  font-size: var(--fs-sm);
  cursor: pointer;
}
</style>
