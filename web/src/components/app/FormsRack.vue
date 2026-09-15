<script setup lang="ts">
/**
 * The sorting rack (/app): every form as a pigeonhole, with this month's numbers on top.
 * Loads the list first, then fills in sparklines, unread and spam counts per row.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { EmailSettingsDto, FormDto, MeDto } from '@sendm8/shared';
import Icon from '../ui/Icon.vue';
import MeterStrip from './rack/MeterStrip.vue';
import RackTable from './rack/RackTable.vue';
import { rackRows, rackSummary, todayLabel, type UnreadCount } from './rack/rackRows';
import { toForm } from '../../lib/api/adapters';
import { api } from '../../lib/api/endpoints';
import { friendlyError } from '../../lib/api/errors';
import { guardSession } from '../../lib/api/session';
import { FORMS_CHANGED, UNREAD_CHANGED, invalidate, loadEmailSettings, loadForms, loadStats, unreadFor } from '../../lib/api/store';
import type { Form } from '../../lib/api/types';

const loading = ref(true);
const error = ref('');
const me = ref<MeDto | null>(null);
const forms = ref<Form[]>([]);
const email = ref<EmailSettingsDto | null>(null);
const unread = reactive<Record<string, UnreadCount>>({});
const now = ref(Date.now());
const today = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    me.value = await guardSession();
    if (!me.value) return;
    const [dtos, settings] = await Promise.all([loadForms(), loadEmailSettings().catch(() => null)]);
    email.value = settings;
    forms.value = dtos.map((d) => toForm(d));
    loading.value = false;
    loadDetails(dtos);
  } catch (err) {
    error.value = friendlyError(err);
    loading.value = false;
  }
}

/** Sparklines and unread counts fill in per row after the list is up. */
async function loadDetails(dtos: FormDto[]) {
  const queue = [...dtos];
  const worker = async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      const id = d.id;
      // The list endpoint has no folder counts, so each form's detail brings its spam count.
      const [stats, u, detail] = await Promise.allSettled([loadStats(id), unreadFor(d), api.getForm(id)]);
      const f = forms.value.find((x) => x.id === id);
      if (f && stats.status === 'fulfilled') f.daily = stats.value.map((s) => s.submissions);
      if (f && detail.status === 'fulfilled') f.counts = detail.value.counts ?? null;
      if (u.status === 'fulfilled') unread[id] = { count: u.value.count, more: u.value.more };
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

onMounted(() => {
  today.value = todayLabel(new Date());
  window.addEventListener(UNREAD_CHANGED, onUnread);
  window.addEventListener(FORMS_CHANGED, onFormsChanged);
  load();
});
onBeforeUnmount(() => {
  window.removeEventListener(UNREAD_CHANGED, onUnread);
  window.removeEventListener(FORMS_CHANGED, onFormsChanged);
});

const summary = computed(() => rackSummary(forms.value, unread, me.value, email.value));
const rows = computed(() => rackRows(forms.value, unread));
</script>

<template>
  <div class="rack-page" :aria-busy="loading ? 'true' : undefined">
    <header class="page-head">
      <p class="label muted">The sorting rack<template v-if="today"> · {{ today }}</template></p>
      <h1 class="h1 page-title">Your forms</h1>
      <p v-if="loading" class="page-lede"><span class="skel" style="width: 26rem; max-width: 100%; height: 1.1rem"></span></p>
      <p v-else-if="error" class="page-lede">Your pigeonholes are here somewhere. We just couldn’t fetch them.</p>
      <p v-else-if="!forms.length" class="page-lede">No pigeonholes yet. Make one, grab its endpoint and paste it into a form. About thirty seconds.</p>
      <p v-else class="page-lede">
        {{ forms.length === 1 ? '1 pigeonhole' : `${forms.length} pigeonholes` }}, <strong>{{ summary.unreadTotal }}{{ summary.unreadMore ? '+' : '' }} unread</strong>. Click one to
        open its inbox, or grab an endpoint and paste it into a form.
      </p>
    </header>

    <div v-if="error" class="notice notice-signal rack-error" role="alert">
      <span class="notice-icon"><Icon name="alert" :size="20" /></span>
      <p class="notice-title">Couldn’t load your forms</p>
      <div class="notice-body">
        <p>{{ error }}</p>
        <p><button type="button" class="btn btn-outline btn-sm" @click="onFormsChanged"><Icon name="refresh" :size="16" /> Try again</button></p>
      </div>
    </div>

    <template v-else>
      <MeterStrip :loading="loading" :summary="summary" />
      <RackTable :loading="loading" :rows="rows" :now="now" />
    </template>
  </div>
</template>

<style scoped>
.page-head {
  display: grid;
  gap: var(--s-2);
  margin-bottom: var(--s-6);
}
.page-title {
  font-size: clamp(2.6rem, 5.4vw, 4.6rem);
}
.page-lede {
  max-width: 52ch;
  color: var(--fg-muted);
  font-size: var(--fs-md);
}
.page-lede strong {
  color: var(--fg);
}
.rack-error {
  margin-bottom: var(--s-6);
}
</style>
