<script setup lang="ts">
/** Download links for uploaded files, plus any that were dropped on the way in. */
import Icon from '../../ui/Icon.vue';
import type { SubmissionFile } from '../../../lib/api/types';
import { fileSize } from '../../../lib/api/adapters';

defineProps<{ files: SubmissionFile[]; dropped: string[] }>();
</script>

<template>
  <ul v-if="files.length" role="list" class="files" aria-label="Attached files">
    <li v-for="f in files" :key="f.id">
      <a class="file" :href="f.url" :download="f.name">
        <span class="file-ico" aria-hidden="true"><Icon name="paperclip" :size="18" /></span>
        <span class="file-name">{{ f.name }} <Icon name="download" :size="14" /></span>
        <span class="mono file-meta">{{ fileSize(f.size) }} · {{ f.type.split('/')[1]?.toUpperCase() || 'FILE' }} · field “{{ f.field }}”</span>
      </a>
    </li>
  </ul>
  <p v-if="dropped.length" class="dropped mono">Files not kept: {{ dropped.join(', ') }}</p>
</template>

<style scoped>
.files {
  display: grid;
  gap: var(--s-2);
}
.file {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: var(--s-3);
  align-items: center;
  padding: 0.6rem 0.8rem;
  border: 1px dashed var(--line-strong);
  background: var(--bg-raised);
}
.file-ico {
  grid-row: span 2;
}
.file-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.file-meta {
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
}
a.file {
  text-decoration: none;
  color: var(--fg);
}
a.file:hover {
  border-style: solid;
  background: var(--bg);
}
.file-name :deep(svg) {
  vertical-align: -2px;
  color: var(--fg-muted);
}
.dropped {
  margin-top: var(--s-2);
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
}
</style>
