<script setup lang="ts">
/**
 * /app/admin: the sorting office's back room. Plain on purpose: usage against the free tiers,
 * abuse reports, errors, the blocklist and user suspensions. Every endpoint 404s for non-admins.
 */
import { onMounted, ref } from 'vue';
import type { MeDto } from '@sendm8/shared';
import Icon from '../ui/Icon.vue';
import { friendlyError } from '../../lib/api/errors';
import { guardSession } from '../../lib/api/session';
import AdminUsage from './admin/AdminUsage.vue';
import AdminGrowth from './admin/AdminGrowth.vue';
import AdminHosts from './admin/AdminHosts.vue';
import AdminReports from './admin/AdminReports.vue';
import AdminErrors from './admin/AdminErrors.vue';
import AdminBlocklist from './admin/AdminBlocklist.vue';
import AdminSuspendUser from './admin/AdminSuspendUser.vue';

const state = ref<'loading' | 'ready' | 'forbidden' | 'error'>('loading');
const error = ref('');
const me = ref<MeDto | null>(null);
const blocklist = ref<InstanceType<typeof AdminBlocklist> | null>(null);

onMounted(async () => {
  try {
    me.value = await guardSession();
    if (!me.value) return;
    if (!me.value.isAdmin) {
      state.value = 'forbidden';
      return;
    }
    state.value = 'ready';
  } catch (err) {
    error.value = friendlyError(err);
    state.value = 'error';
  }
});
</script>

<template>
  <div class="office">
    <header class="app-head">
      <div>
        <h1 class="app-title">Admin</h1>
        <p class="app-sub">Usage, reports, errors and the blocklist. Actions here affect every account.</p>
      </div>
    </header>

    <div v-if="state === 'loading'" class="office-grid" aria-busy="true">
      <span v-for="n in 4" :key="n" class="skel" style="height: 7rem"></span>
    </div>

    <div v-else-if="state === 'forbidden'" class="notice office-notice" role="note">
      <span class="notice-icon"><Icon name="lock" :size="20" /></span>
      <p class="notice-title">Staff only</p>
      <div class="notice-body">
        <p>This page is for sendm8 admins. <a href="/app">Back to your forms</a>.</p>
      </div>
    </div>

    <div v-else-if="state === 'error'" class="notice notice-signal office-notice" role="alert">
      <span class="notice-icon"><Icon name="alert" :size="20" /></span>
      <p class="notice-title">Couldn’t open the admin page</p>
      <div class="notice-body"><p>{{ error }}</p></div>
    </div>

    <template v-else>
      <AdminUsage />
      <AdminGrowth />
      <AdminHosts />
      <AdminReports />
      <AdminErrors />

      <div class="office-two">
        <AdminBlocklist ref="blocklist" />
        <AdminSuspendUser :my-id="me?.user.id" @changed="blocklist?.load()" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.office-notice {
  max-width: 40rem;
}
/* The sections are child components; their root <section class="office-section"> picks these up. */
.office-section + .office-section,
.office-two {
  margin-top: var(--s-6);
  padding-top: var(--s-5);
  border-top: 1px solid var(--line);
}
.office-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--s-3);
}
.office-two {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: clamp(1.5rem, 3vw, 2.5rem);
  align-items: start;
}
.office-two > .office-section + .office-section {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
@media (max-width: 1200px) {
  .office-two {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 900px) {
  .office-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
