<script setup lang="ts">
/**
 * Shared "which form is this?" step for /app/forms/<id> pages. The static build has one shell
 * under the id "_", so the real id comes from the URL and everything loads client-side.
 * Renders a skeleton, a not-found or an error state, then the slot with the loaded form.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from '../ui/Icon.vue';
import { api } from '../../lib/api/endpoints';
import { isApiError } from '../../lib/api/client';
import { toChannel, toForm } from '../../lib/api/adapters';
import { friendlyError } from '../../lib/api/errors';
import { formIdFromPath, guardSession } from '../../lib/api/session';
import { hydrateEndpoint, hydrateFormLinks, setCrumb, setTitle } from '../../lib/page';
import { DATA_REFRESHED, loadChannels, loadForm, markStale, peek } from '../../lib/api/store';
import type { ChannelDto, FormDto } from '@sendm8/shared';
import type { Channel, Form } from '../../lib/api/types';

const props = defineProps<{
  /** Page title once the form's name is known, e.g. "{name} inbox". */
  titleTemplate: string;
  /** Which breadcrumb shows the form name. */
  crumbIndex: number;
  /** Skeleton flavour. */
  variant: 'inbox' | 'settings';
}>();

const state = ref<'loading' | 'ready' | 'missing' | 'error'>('loading');
const error = ref('');
const form = ref<Form | null>(null);
const channels = ref<Channel[]>([]);
/** Bumped when a background refresh brings different data, so drafts built from the old copy restart. */
const rev = ref(0);

async function load() {
  state.value = 'loading';
  const id = formIdFromPath(location.pathname);
  if (!id) {
    state.value = 'missing';
    return;
  }
  hydrateFormLinks(id);
  try {
    if (!(await guardSession())) return;
    // Show a cached copy at once and refresh it behind the scenes. Settings always re-checks with the
    // server; if that finds something different, `rev` bumps and the settings remount on the fresh copy.
    if (props.variant === 'settings') {
      markStale(`form:${id}`);
      markStale(`channels:${id}`);
    }
    const [dto, chans] = await Promise.all([loadForm(id), loadChannels(id)]);
    form.value = toForm(dto);
    channels.value = chans.map(toChannel);
    setCrumb(props.crumbIndex, dto.name, `/app/forms/${id}`);
    hydrateEndpoint(form.value.endpoint);
    setTitle(props.titleTemplate.replace('{name}', dto.name));
    state.value = 'ready';
  } catch (err) {
    if (isApiError(err) && err.status === 404) {
      state.value = 'missing';
      setCrumb(props.crumbIndex, 'Not found');
      return;
    }
    error.value = friendlyError(err);
    state.value = 'error';
  }
}

function onFormUpdated(next: Form) {
  form.value = next;
  setCrumb(props.crumbIndex, next.name, `/app/forms/${next.id}`);
  setTitle(props.titleTemplate.replace('{name}', next.name));
}

/** A quiet background refresh of the cached form or channels: swap them in without a skeleton. */
function onRefreshed(e: Event) {
  const id = form.value?.id;
  if (!id || state.value !== 'ready') return;
  const { key } = (e as CustomEvent<{ key: string }>).detail;
  if (key === `form:${id}`) {
    const dto = peek<FormDto>(key);
    if (dto) onFormUpdated(toForm(dto, form.value?.daily));
  } else if (key === `channels:${id}`) {
    const list = peek<ChannelDto[]>(key);
    if (list) channels.value = list.map(toChannel);
  } else {
    return;
  }
  if (props.variant === 'settings') rev.value++;
}

onMounted(() => {
  window.addEventListener(DATA_REFRESHED, onRefreshed);
  load();
});
onBeforeUnmount(() => {
  window.removeEventListener(DATA_REFRESHED, onRefreshed);
  // Settings may have changed the channels: keep showing them, but re-check on the next visit.
  // (A saved form goes straight into the cache, see useSettingsDraft.)
  const id = form.value?.id;
  if (props.variant === 'settings' && id) markStale(`channels:${id}`);
});
</script>

<template>
  <slot v-if="state === 'ready' && form" :form="form" :channels="channels" :rev="rev" :on-form-updated="onFormUpdated" />

  <!-- Placeholders shaped like the real page, so nothing jumps when it arrives. -->
  <div v-else-if="state === 'loading' && variant === 'inbox'" class="fl-inbox" aria-busy="true" aria-label="Loading form">
    <div class="fl-list">
      <span class="skel" style="width: 70%; height: 1.75rem"></span>
      <span class="skel" style="height: 2.25rem"></span>
      <span v-for="n in 6" :key="n" class="skel" style="height: 3.75rem"></span>
    </div>
    <div class="fl-detail">
      <span class="skel" style="width: 40%; height: 1.4rem"></span>
      <span class="skel" style="width: 25%; height: 0.9rem"></span>
      <span class="skel" style="width: 60%; height: 2rem"></span>
      <span class="skel" style="height: 8rem"></span>
    </div>
  </div>

  <div v-else-if="state === 'loading'" class="fl-settings" aria-busy="true" aria-label="Loading form">
    <span class="skel" style="width: 8rem; height: 1.5rem"></span>
    <span class="skel" style="width: 12rem; height: 0.9rem"></span>
    <span class="skel" style="height: 2.25rem; margin-top: var(--s-4)"></span>
    <span v-for="n in 4" :key="n" class="skel" style="height: 3rem"></span>
  </div>

  <div v-else class="fl-state" :role="state === 'error' ? 'alert' : undefined">
    <template v-if="state === 'missing'">
      <h1 class="fl-title">Form not found</h1>
      <p class="fl-body-text">It doesn’t exist, or it belongs to another account. Check the link, or pick one of your forms.</p>
      <a class="btn btn-outline btn-sm" href="/app"><Icon name="arrow-left" :size="16" /> All forms</a>
    </template>
    <template v-else>
      <h1 class="fl-title">Couldn’t open this form</h1>
      <p class="fl-body-text">{{ error }}</p>
      <button type="button" class="btn btn-outline btn-sm" @click="load"><Icon name="refresh" :size="16" /> Try again</button>
    </template>
  </div>
</template>

<style scoped>
.fl-inbox {
  display: grid;
  grid-template-columns: 24rem minmax(0, 1fr);
  height: calc(100dvh - var(--app-topbar-h));
}
.fl-list,
.fl-detail {
  display: grid;
  align-content: start;
  gap: var(--s-2);
  padding: var(--s-3);
}
.fl-list {
  border-right: 1px solid var(--line);
}
.fl-detail {
  gap: var(--s-3);
  max-width: 46rem;
  padding: var(--s-5) var(--app-gutter);
}
.fl-settings {
  display: grid;
  gap: var(--s-2);
}
.fl-state {
  display: grid;
  justify-items: start;
  gap: var(--s-2);
  max-width: 36rem;
  padding: var(--s-7) var(--app-gutter);
}
.fl-title {
  font-size: 1.25rem;
  font-weight: 650;
}
.fl-body-text {
  margin-bottom: var(--s-2);
  color: var(--fg-muted);
}
@media (max-width: 1100px) {
  .fl-inbox {
    grid-template-columns: 20rem minmax(0, 1fr);
  }
}
@media (max-width: 720px) {
  .fl-inbox {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }
  .fl-list {
    border-right: 0;
  }
  .fl-detail {
    display: none;
  }
}
</style>
