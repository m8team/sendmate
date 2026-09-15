<script setup lang="ts">
import { reactive, ref } from 'vue';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { validateSuspension } from './adminRules';
import { useAdminAction } from './useAdminAction';

/** 04 Suspend a user, after a second click to confirm, or lift a suspension. */
defineProps<{ myId: string | undefined }>();
const emit = defineEmits<{ changed: [] }>();

const user = reactive({ id: '', reason: '' });
const userError = ref('');
const confirmSuspend = ref(false);
const { busy, run } = useAdminAction();

async function suspend() {
  userError.value = validateSuspension(user.id, user.reason);
  if (userError.value) return;
  if (!confirmSuspend.value) {
    confirmSuspend.value = true;
    return;
  }
  confirmSuspend.value = false;
  if (await run('user:suspend', () => api.suspendUser(user.id, user.reason), 'Suspended. Their forms are disabled and they’ve been signed out.')) emit('changed');
}

async function unsuspend() {
  userError.value = validateSuspension(user.id, null);
  if (userError.value) return;
  if (await run('user:unsuspend', () => api.unsuspendUser(user.id), 'Suspension lifted. Their forms stay disabled until you restore them.')) emit('changed');
}
</script>

<template>
  <section class="ad-section" aria-labelledby="ad-users">
    <div class="ad-bar">
      <h2 id="ad-users" class="bay label label-lg"><span class="bay-no">05</span> Suspend a user</h2>
    </div>
    <form class="ad-panel" novalidate @submit.prevent="suspend">
      <div class="field">
        <label class="field-label" for="ad-user-id">User id</label>
        <input id="ad-user-id" v-model="user.id" class="input mono" autocomplete="off" spellcheck="false" placeholder="e.g. dev-user" @input="confirmSuspend = false" />
      </div>
      <div class="field">
        <label class="field-label" for="ad-user-reason">Reason</label>
        <input id="ad-user-reason" v-model="user.reason" class="input" maxlength="200" autocomplete="off" placeholder="phishing: repeat offender" />
      </div>
      <p v-if="userError" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ userError }}</p>
      <div v-if="confirmSuspend" class="notice notice-signal" role="alert">
        <span class="notice-icon"><Icon name="alert" :size="18" /></span>
        <p class="notice-title">Suspend {{ user.id.trim() }}?</p>
        <div class="notice-body">
          <p>They’re signed out everywhere and every one of their forms is disabled. Unsuspending doesn’t turn the forms back on.</p>
        </div>
      </div>
      <div class="cluster">
        <button type="submit" class="btn btn-danger btn-sm" :aria-disabled="busy['user:suspend'] ? 'true' : undefined">
          <Icon name="lock" :size="16" /> {{ confirmSuspend ? 'Yes, suspend' : 'Suspend user' }}
        </button>
        <button type="button" class="btn btn-outline btn-sm" :aria-disabled="busy['user:unsuspend'] ? 'true' : undefined" @click="unsuspend">Lift suspension</button>
      </div>
      <p class="field-hint">
        Use the id from the <code>user</code> table, not the email. Suspended users show up in the blocklist, where you can lift it too. Your own id is
        <span class="mono">{{ myId }}</span>, and you can’t suspend yourself.
      </p>
    </form>
  </section>
</template>

<style scoped src="./admin-section.css"></style>
