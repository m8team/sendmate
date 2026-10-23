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
    <header class="office-head">
      <p class="label office-kicker"><span class="bay-no">Back room</span> · Admins only</p>
      <h1 class="h2">Sorting office admin</h1>
      <p class="office-lede">Free-tier headroom, abuse reports, errors and the blocklist. Everything here acts on every account, so read twice.</p>
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
.office-head {
  display: grid;
  gap: var(--s-2);
  margin-bottom: clamp(1.25rem, 3vw, 2.25rem);
  padding-bottom: var(--s-4);
  border-bottom: var(--bw-strong) solid var(--line-strong);
}
.office-kicker {
  color: var(--fg-muted);
}
.office-lede {
  max-width: 60ch;
  color: var(--fg-muted);
}
.office-notice {
  max-width: 40rem;
}
/* The sections are child components; their root <section class="office-section"> picks these up. */
.office-section + .office-section,
.office-two {
  margin-top: var(--s-8);
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
