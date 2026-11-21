<script setup lang="ts">
/**
 * The forms list (/app): a header with the count and "New form", then one row per form.
 * Loads the list first, then fills in each form's unread count.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { MeDto } from '@sendm8/shared';
import Icon from '../ui/Icon.vue';
import HeardFromDialog from './rack/HeardFromDialog.vue';
import OtherAddressCard from './rack/OtherAddressCard.vue';
import FormTable from './rack/FormTable.vue';
import { rackRows, rackSubtitle, type UnreadCount } from './rack/rackRows';
import { toForm } from '../../lib/api/adapters';
import { friendlyError } from '../../lib/api/errors';
import { guardSession } from '../../lib/api/session';
import { DATA_REFRESHED, FORMS_CHANGED, UNREAD_CHANGED, invalidate, loadForms, unreadFor } from '../../lib/api/store';
import type { Form } from '../../lib/api/types';

const loading = ref(true);
const error = ref('');
const me = ref<MeDto | null>(null);
const forms = ref<Form[]>([]);
const unread = reactive<Record<string, UnreadCount>>({});
const now = ref(Date.now());

async function load() {
  // Only the first load shows skeletons; later ones (a change, a background refresh) swap quietly.
  if (!forms.value.length) loading.value = true;
  error.value = '';
  try {
    me.value = await guardSession();
    if (!me.value) return;
    const dtos = await loadForms();
    forms.value = dtos.map((d) => toForm(d));
    loading.value = false;
    loadUnread(dtos);
  } catch (err) {
    error.value = friendlyError(err);
    loading.value = false;
  }
}

/** Unread counts fill in per row after the list is up, three forms at a time. */
async function loadUnread(dtos: Parameters<typeof unreadFor>[0][]) {
  const queue = [...dtos];
  const worker = async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      try {
        const u = await unreadFor(d);
        unread[d.id] = { count: u.count, more: u.more };
      } catch {
        /* the row just shows no count */
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

function onUnread(e: Event) {
  const { formId, count, more } = (e as CustomEvent<{ formId: string; count: number; more: boolean }>).detail;
  unread[formId] = { count, more };
}

function onFormsChanged() {
  invalidate('forms');
  load();
}

function onRefreshed(e: Event) {
  if ((e as CustomEvent<{ key: string }>).detail.key === 'forms') load();
}

onMounted(() => {
  window.addEventListener(UNREAD_CHANGED, onUnread);
  window.addEventListener(FORMS_CHANGED, onFormsChanged);
  window.addEventListener(DATA_REFRESHED, onRefreshed);
  load();
});
onBeforeUnmount(() => {
  window.removeEventListener(UNREAD_CHANGED, onUnread);
  window.removeEventListener(FORMS_CHANGED, onFormsChanged);
  window.removeEventListener(DATA_REFRESHED, onRefreshed);
});

const rows = computed(() => rackRows(forms.value, unread));
const subtitle = computed(() => rackSubtitle(forms.value.length, unread));
</script>

<template>
  <div :aria-busy="loading ? 'true' : undefined">
    <header class="app-head">
      <div>
        <h1 class="app-title">Forms</h1>
        <p class="app-sub">
          <span v-if="loading" class="skel" style="width: 8rem; height: 0.9rem"></span>
          <template v-else-if="!error">{{ subtitle }}</template>
        </p>
      </div>
      <a class="btn btn-signal btn-sm" href="/app/onboarding"><Icon name="plus" :size="16" /> New form</a>
    </header>

    <div v-if="error" class="notice notice-signal" role="alert">
      <span class="notice-icon"><Icon name="alert" :size="18" /></span>
      <p class="notice-title">Couldn’t load your forms</p>
      <div class="notice-body">
        <p>{{ error }}</p>
        <p><button type="button" class="btn btn-outline btn-sm" @click="onFormsChanged"><Icon name="refresh" :size="16" /> Try again</button></p>
      </div>
    </div>

    <template v-else>
      <FormTable :loading="loading" :rows="rows" :now="now" />
      <OtherAddressCard v-if="!loading && me && !forms.length" :signed-in-as="me.user.email" @claimed="onFormsChanged" />
      <!-- Only once there's a form, so it never gets in the way of making the first one. -->
      <HeardFromDialog v-if="!loading && me && me.heardFrom === null && forms.length" @done="(answer) => me && (me.heardFrom = answer)" />
    </template>
  </div>
</template>
