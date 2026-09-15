<script setup lang="ts">
/**
 * Shared "which form is this?" step for /app/forms/<id> pages. The static build has one shell
 * under the id "_", so the real id comes from the URL and everything loads client-side.
 * Renders a skeleton, a not-found or an error state, then the slot with the loaded form.
 */
import { onMounted, ref } from 'vue';
import Icon from '../ui/Icon.vue';
import { api } from '../../lib/api/endpoints';
import { isApiError } from '../../lib/api/client';
import { toChannel, toForm } from '../../lib/api/adapters';
import { friendlyError } from '../../lib/api/errors';
import { formIdFromPath, guardSession } from '../../lib/api/session';
import { hydrateFormLinks, setCrumb, setTitle } from '../../lib/page';
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
    const [dto, chans] = await Promise.all([api.getForm(id), api.listChannels(id)]);
    form.value = toForm(dto);
    channels.value = chans.map(toChannel);
    setCrumb(props.crumbIndex, dto.name, `/app/forms/${id}`);
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

onMounted(load);
</script>

<template>
  <slot v-if="state === 'ready' && form" :form="form" :channels="channels" :on-form-updated="onFormUpdated" />

  <div v-else-if="state === 'loading'" class="fl-skel" :class="`fl-${variant}`" aria-busy="true" aria-label="Loading form">
    <div class="fl-head">
      <span class="skel" style="width: 9rem; height: 0.7rem"></span>
      <span class="skel skel-ink" style="width: min(22rem, 70%); height: 2.2rem"></span>
    </div>
    <div class="fl-body">
      <div class="fl-col">
        <span v-for="n in 5" :key="n" class="skel" :style="{ height: variant === 'inbox' ? '4.2rem' : '2.6rem' }"></span>
      </div>
      <div class="fl-main">
        <span class="skel" style="width: 40%; height: 1.4rem"></span>
        <span class="skel" style="height: 9rem"></span>
        <span class="skel" style="width: 75%; height: 1rem"></span>
      </div>
    </div>
  </div>

  <div v-else class="fl-state" :role="state === 'error' ? 'alert' : undefined">
    <div class="fl-slot" aria-hidden="true"><span></span></div>
    <template v-if="state === 'missing'">
      <p class="label muted">Return to sender</p>
      <h1 class="fl-title">No such pigeonhole.</h1>
      <p class="fl-body-text">That form doesn’t exist, or it belongs to someone else. Check the link, or pick one of your forms.</p>
      <a class="btn btn-outline btn-sm" href="/app"><Icon name="arrow-left" :size="16" /> All forms</a>
    </template>
    <template v-else>
      <p class="label muted">Delivery attempted</p>
      <h1 class="fl-title">Couldn’t open this form.</h1>
      <p class="fl-body-text">{{ error }}</p>
      <button type="button" class="btn btn-outline btn-sm" @click="load"><Icon name="refresh" :size="16" /> Try again</button>
    </template>
  </div>
</template>

<style scoped>
.fl-skel {
  display: grid;
  gap: var(--s-5);
}
.fl-inbox {
  padding: var(--s-4) clamp(1rem, 2.5vw, 2rem);
  min-height: calc(100dvh - 3.75rem);
  align-content: start;
}
.fl-head {
  display: grid;
  gap: var(--s-3);
  padding-bottom: var(--s-4);
  border-bottom: var(--bw-strong) solid var(--line-strong);
}
.fl-body {
  display: grid;
  grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
  gap: var(--s-6);
}
.fl-settings .fl-body {
  grid-template-columns: minmax(0, 13rem) minmax(0, 1fr);
}
.fl-col,
.fl-main {
  display: grid;
  gap: var(--s-3);
  align-content: start;
}
@media (max-width: 720px) {
  .fl-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .fl-main {
    display: none;
  }
}
.fl-state {
  display: grid;
  justify-items: start;
  gap: var(--s-2);
  padding: var(--s-8) clamp(1rem, 4vw, 3rem);
  max-width: 40rem;
}
.fl-slot {
  width: 4.5rem;
  height: 3.2rem;
  margin-bottom: var(--s-3);
  border: 2px solid var(--line-strong);
  border-top-width: 7px;
  background: var(--bg);
  display: grid;
  align-items: end;
}
.fl-slot span {
  display: block;
  height: 2px;
  margin: 0 6px 6px;
  background: repeating-linear-gradient(90deg, var(--fg-subtle) 0 4px, transparent 4px 8px);
}
.fl-title {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(2.2rem, 5vw, 3.4rem);
  line-height: 0.95;
}
.fl-body-text {
  max-width: 44ch;
  color: var(--fg-muted);
  margin-bottom: var(--s-3);
}
</style>
