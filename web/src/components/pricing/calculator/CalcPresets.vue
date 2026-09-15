<script setup lang="ts">
import { computed } from 'vue';
import { PRESETS, presetIndex, type Preset } from './calcLogic';

const props = defineProps<{ perForm: number; forms: number }>();
const emit = defineEmits<{ apply: [preset: Preset] }>();

const activePreset = computed(() => presetIndex(props.perForm, props.forms));
</script>

<template>
  <div class="presets">
    <p class="label muted" id="calc-presets">Try an example</p>
    <div class="preset-row" role="group" aria-labelledby="calc-presets">
      <button
        v-for="(p, i) in PRESETS"
        :key="p.label"
        type="button"
        class="preset"
        :aria-pressed="activePreset === i ? 'true' : 'false'"
        @click="emit('apply', p)"
      >
        {{ p.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-2);
}
.preset {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-1);
  background: transparent;
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  font-weight: 500;
  color: var(--fg);
  min-height: 2.25rem;
}
.preset:hover {
  background: var(--bg-sunk);
}
.preset[aria-pressed='true'] {
  background: var(--fg);
  color: var(--bg);
}
</style>
