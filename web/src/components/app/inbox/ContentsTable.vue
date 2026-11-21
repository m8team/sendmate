<script setup lang="ts">
/** What was in the form: each field's name above its value, then the special `_fields`. Held values show masked. */
import { computed } from 'vue';
import type { Submission } from '../../../lib/api/types';

const props = defineProps<{ s: Submission }>();

const isHeld = computed(() => props.s.status === 'held');
const fields = computed(() => Object.entries(props.s.data).filter(([k]) => !k.startsWith('_')));
const specialFields = computed(() => Object.entries(props.s.special).filter(([, val]) => val));
</script>

<template>
  <dl class="fields">
    <div v-for="[k, val] in fields" :key="k" class="field-row">
      <dt>{{ k }}</dt>
      <dd>
        <span v-if="val.trim()" class="val" :class="{ 'val-held': isHeld }">{{ val }}</span>
        <span v-else class="val-empty">Left blank</span>
      </dd>
    </div>
    <div v-for="[k, val] in specialFields" :key="`special-${k}`" class="field-row">
      <dt>{{ k }}</dt>
      <dd><span class="val">{{ val }}</span></dd>
    </div>
  </dl>
</template>

<style scoped>
.fields {
  display: grid;
  gap: var(--s-4);
}
.field-row {
  display: grid;
  gap: var(--s-1);
  min-width: 0;
}
dt {
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.val {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.55;
}
.val-empty {
  color: var(--fg-subtle);
}
/* held values read "[held for review]": set them like a code, not like prose */
.val-held {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--warn);
}
</style>
