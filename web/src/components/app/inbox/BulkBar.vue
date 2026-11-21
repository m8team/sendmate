<script setup lang="ts">
/** Select-all plus, once anything's selected, the bulk actions; otherwise how much is in view. */
import Icon from '../../ui/Icon.vue';
import { listMeta } from './folders';

defineProps<{
  pickedCount: number;
  visibleCount: number;
  allSelected: boolean;
  someSelected: boolean;
  loading: boolean;
  hasMore: boolean;
  appliedQuery: string;
  busy: boolean;
  allStarred: boolean;
  allBlocked: boolean;
}>();
const emit = defineEmits<{ 'toggle-all': []; read: []; star: []; spam: []; delete: [] }>();
</script>

<template>
  <div class="selbar" :class="{ 'is-active': pickedCount }">
    <input
      type="checkbox"
      class="check"
      :checked="allSelected"
      :indeterminate="someSelected"
      :disabled="!visibleCount"
      :aria-label="allSelected ? 'Deselect all' : `Select all ${visibleCount} in view`"
      @change="emit('toggle-all')"
    />
    <template v-if="pickedCount">
      <span class="sel-n" aria-live="polite">{{ pickedCount }} selected</span>
      <div class="bulk">
        <button type="button" class="btn btn-ghost btn-xs" @click="emit('read')"><Icon name="eye" :size="14" /> Read</button>
        <button type="button" class="btn btn-ghost btn-xs" :aria-disabled="busy ? 'true' : undefined" @click="emit('star')"><Icon name="star" :size="14" /> {{ allStarred ? 'Unstar' : 'Star' }}</button>
        <button type="button" class="btn btn-ghost btn-xs" :aria-disabled="busy ? 'true' : undefined" @click="emit('spam')">
          <Icon :name="allBlocked ? 'check' : 'shield'" :size="14" /> {{ allBlocked ? 'Not spam' : 'Spam' }}
        </button>
        <button type="button" class="btn btn-danger btn-xs" @click="emit('delete')"><Icon name="trash" :size="14" /> Delete</button>
      </div>
    </template>
    <template v-else>
      <span class="sel-meta label">
        <template v-if="loading">Loading…</template>
        <template v-else>{{ listMeta(visibleCount, hasMore, appliedQuery) }}</template>
      </span>
      <span class="sel-meta label sel-sort">Newest first</span>
    </template>
  </div>
</template>

<style scoped>
.selbar {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 2.4rem;
  margin: 0 calc(var(--s-3) * -1);
  padding: 0.2rem var(--s-3) 0.2rem calc(var(--s-3) + 0.1rem);
  border-bottom: 1px solid var(--line);
}
.selbar.is-active {
  background: var(--bg-sunk);
}
.check:indeterminate::before {
  transform: scale(1);
  clip-path: inset(40% 5% 40% 5%);
}
.sel-n {
  font-size: var(--fs-xs);
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.sel-meta {
  color: var(--fg-muted);
}
.sel-sort {
  margin-left: auto;
}
.bulk {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-left: auto;
}
.bulk .btn-xs {
  padding-inline: 0.4rem;
  gap: 0.3rem;
}
.bulk .btn-danger {
  --btn-border: transparent;
}
</style>
