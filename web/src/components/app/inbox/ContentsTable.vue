<script setup lang="ts">
/** What was in the form: one row per field, then the special `_fields`. Held values show masked. */
import { computed } from 'vue';
import type { Submission } from '../../../lib/api/types';

const props = defineProps<{ s: Submission }>();

const isHeld = computed(() => props.s.status === 'held');
const fields = computed(() => Object.entries(props.s.data).filter(([k]) => !k.startsWith('_')));
const specialFields = computed(() => Object.entries(props.s.special).filter(([, val]) => val));
</script>

<template>
  <table class="kv">
    <tbody>
      <tr v-for="[k, val] in fields" :key="k">
        <th scope="row" class="mono">{{ k }}</th>
        <td>
          <span v-if="val.trim()" class="kv-val" :class="{ 'kv-held': isHeld }">{{ val }}</span>
          <span v-else class="kv-empty">left blank</span>
        </td>
      </tr>
      <tr v-for="[k, val] in specialFields" :key="`special-${k}`">
        <th scope="row" class="mono">{{ k }}</th>
        <td><span class="kv-val">{{ val }}</span></td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.kv {
  width: 100%;
  border-collapse: collapse;
  border-top: var(--bw-strong) solid var(--line-strong);
}
.kv th,
.kv td {
  padding: 0.7rem 0;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
  text-align: left;
}
.kv th {
  width: 9.5rem;
  padding-right: var(--s-4);
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--fg-muted);
  overflow-wrap: anywhere;
}
.kv-val {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--fs-md);
  line-height: 1.5;
}
.kv-empty {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--fg-subtle);
  font-style: italic;
}
/* held values read "[held for review]": set them like a code, not like prose */
.kv-held {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  color: var(--warn);
}
@container det (max-width: 34rem) {
  .kv th {
    width: 6.5rem;
  }
}
</style>
