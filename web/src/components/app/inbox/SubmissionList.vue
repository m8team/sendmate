<script setup lang="ts">
/** The folder's tab panel: skeleton rows while sorting, an error, the rows with "Load older post", or an empty slot. */
import { computed, ref } from 'vue';
import Icon from '../../ui/Icon.vue';
import type { Submission } from '../../../lib/api/types';
import { emptyCopy, type Filter } from './folders';
import SubmissionRow from './SubmissionRow.vue';

const props = defineProps<{
  filter: Filter;
  appliedQuery: string;
  endpoint: string;
  loading: boolean;
  loadingMore: boolean;
  loadError: string;
  visible: Submission[];
  hasMore: boolean;
  now: number;
  openId: string | null;
  selected: string[];
  tabStopId: string | undefined;
}>();
const emit = defineEmits<{
  retry: [];
  'load-more': [];
  'clear-search': [];
  'back-to-inbox': [];
  open: [id: string];
  focus: [id: string];
  pick: [id: string];
  star: [s: Submission];
}>();

const listEl = ref<HTMLElement | null>(null);
defineExpose({ listEl });

const empty = computed(() => emptyCopy(props.filter, props.appliedQuery, props.endpoint));
</script>

<template>
  <div id="inbox-rows" class="rows-wrap" role="tabpanel" :aria-labelledby="`tab-${filter}`" :aria-busy="loading ? 'true' : undefined">
    <ul v-if="loading" role="list" class="rows" aria-label="Loading submissions">
      <li v-for="n in 6" :key="n" class="row row-skel" aria-hidden="true">
        <span class="skel row-skel-check"></span>
        <span class="row-skel-main">
          <span class="skel" :style="{ width: `${40 + ((n * 17) % 35)}%`, height: '0.8rem' }"></span>
          <span class="skel" :style="{ width: '92%', height: '0.65rem' }"></span>
          <span class="skel" :style="{ width: `${55 + ((n * 11) % 30)}%`, height: '0.65rem' }"></span>
        </span>
      </li>
    </ul>

    <div v-else-if="loadError" class="empty" role="alert">
      <p class="empty-title">Couldn’t load submissions</p>
      <p class="empty-body">{{ loadError }}</p>
      <button type="button" class="btn btn-outline btn-sm" @click="emit('retry')"><Icon name="refresh" :size="16" /> Try again</button>
    </div>

    <ul v-else-if="visible.length" ref="listEl" role="list" class="rows">
      <SubmissionRow
        v-for="s in visible"
        :key="s.id"
        :s="s"
        :now="now"
        :open="openId === s.id"
        :picked="selected.includes(s.id)"
        :tab-stop="tabStopId === s.id"
        @open="emit('open', s.id)"
        @focus="emit('focus', s.id)"
        @pick="emit('pick', s.id)"
        @star="emit('star', s)"
      />
      <li v-if="hasMore" class="row-more">
        <button type="button" class="btn btn-outline btn-sm" :aria-disabled="loadingMore ? 'true' : undefined" @click="emit('load-more')">
          <Icon :name="loadingMore ? 'clock' : 'arrow-down'" :size="16" /> {{ loadingMore ? 'Loading…' : 'Load older' }}
        </button>
      </li>
    </ul>

    <div v-else class="empty">
      <p class="empty-title">{{ empty.title }}</p>
      <p class="empty-body">{{ empty.body }}</p>
      <button v-if="appliedQuery" type="button" class="btn btn-outline btn-sm" @click="emit('clear-search')">Clear search</button>
      <button v-else-if="hasMore" type="button" class="btn btn-outline btn-sm" @click="emit('load-more')">Load older submissions</button>
      <button v-else-if="filter !== 'inbox'" type="button" class="btn btn-outline btn-sm" @click="emit('back-to-inbox')">Back to the inbox</button>
    </div>
  </div>
</template>

<style scoped>
.rows-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.rows {
  display: grid;
}

/* Skeleton rows take the same shape as a real row (SubmissionRow) */
.row-skel {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  padding: 0.8rem 1rem 0.9rem 0.85rem;
  gap: 0.65rem;
  border-bottom: 1px solid var(--line);
  pointer-events: none;
}
.row-skel-check {
  width: 1.1rem;
  height: 1.1rem;
  margin-top: 0.15rem;
}
.row-skel-main {
  display: grid;
  gap: 0.45rem;
}
.row-more {
  display: flex;
  justify-content: center;
  padding: var(--s-4) var(--s-3) var(--s-5);
}

/* ---- Empty and error states ------------------------------------------ */
.empty {
  display: grid;
  justify-items: start;
  gap: var(--s-1);
  padding: var(--s-6) var(--s-4);
}
.empty-title {
  font-weight: 600;
}
.empty-body {
  max-width: 34ch;
  font-size: var(--fs-sm);
  color: var(--fg-muted);
  margin-bottom: var(--s-2);
}
@media (max-width: 720px) {
  .rows-wrap {
    overflow: visible;
  }
}
</style>
