<script setup lang="ts">
/** The forms table: column heads, one FormRow per form (or placeholders while loading), or the empty state. */
import Icon from '../../ui/Icon.vue';
import FormRow from './FormRow.vue';
import type { RackRow } from './rackRows';

defineProps<{ loading: boolean; rows: RackRow[]; now: number }>();
</script>

<template>
  <div v-if="!loading && !rows.length" class="ft-empty">
    <p class="ft-empty-title">No forms yet</p>
    <p class="ft-empty-body">Create a form to get an endpoint, then point your site’s form at it.</p>
    <a class="btn btn-signal btn-sm" href="/app/onboarding"><Icon name="plus" :size="16" /> New form</a>
  </div>

  <div v-else class="ft" role="table" aria-label="Your forms">
    <div class="ft-row ft-head" role="row">
      <span role="columnheader">Form</span>
      <span role="columnheader" class="num">Unread</span>
      <span role="columnheader" class="num">This month</span>
      <span role="columnheader">Last submission</span>
      <span role="columnheader"><span class="sr-only">Endpoint</span></span>
    </div>
    <template v-if="loading">
      <div v-for="n in 3" :key="n" class="ft-row ft-skel" role="row" aria-hidden="true">
        <span class="skel" :style="{ width: `${30 + n * 8}%`, height: '0.9rem' }"></span>
        <span class="skel num-skel"></span>
        <span class="skel num-skel"></span>
        <span class="skel" style="width: 4rem; height: 0.8rem"></span>
        <span></span>
      </div>
    </template>
    <FormRow v-for="r in rows" v-else :key="r.f.id" :row="r" :now="now" />
  </div>
</template>

<style scoped>
.ft {
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  overflow: hidden;
}
/* FormRow's root is also a .ft-row, so this grid reaches it. */
.ft :deep(.ft-row) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 5rem 8rem 9rem 2.5rem;
  column-gap: var(--s-4);
  align-items: center;
  padding: 0 var(--s-4);
}
.ft-head {
  min-height: 2.25rem;
  background: var(--bg-sunk);
  border-bottom: 1px solid var(--line);
  font-size: var(--fs-2xs);
  font-weight: 500;
  color: var(--fg-muted);
}
.num {
  text-align: right;
}
.ft-skel {
  min-height: 3.5rem;
  border-bottom: 1px solid var(--line);
}
.ft-skel:last-child {
  border-bottom: 0;
}
.num-skel {
  justify-self: end;
  width: 2.5rem;
  height: 0.8rem;
}

.ft-empty {
  display: grid;
  justify-items: start;
  gap: var(--s-1);
  padding: var(--s-6) var(--s-5);
  border: 1px dashed var(--line);
  border-radius: var(--r-3);
}
.ft-empty-title {
  font-weight: 600;
}
.ft-empty-body {
  margin-bottom: var(--s-3);
  color: var(--fg-muted);
}

@media (max-width: 760px) {
  .ft :deep(.ft-head),
  .ft :deep(.ft-skel) {
    display: none;
  }
}
</style>
