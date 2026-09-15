<script setup lang="ts">
import { computed } from 'vue';
import { modeOptions, type Mode } from './calcLogic';

const props = defineProps<{ /** Our sender's daily email cap. */ cap: number }>();
const mode = defineModel<Mode>({ required: true });

const options = computed(() => modeOptions(props.cap));
</script>

<template>
  <fieldset class="ctl modes">
    <legend class="field-label">Email notifications go through</legend>
    <label v-for="m in options" :key="m.value" class="mode" :class="{ 'is-on': mode === m.value }">
      <input v-model="mode" class="check" type="radio" name="calc-mode" :value="m.value" />
      <span class="mode-text">
        <span class="mode-label">{{ m.label }}</span>
        <span class="mode-hint mono">{{ m.hint }}</span>
      </span>
    </label>
  </fieldset>
</template>

<style scoped>
.ctl {
  display: grid;
  gap: var(--s-2);
}
.modes {
  border: 0;
  padding: 0;
  min-width: 0;
}
.modes legend {
  margin-bottom: var(--s-2);
}
.mode {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--line);
  cursor: pointer;
}
.mode + .mode {
  margin-top: -1px;
}
.mode:hover {
  border-color: var(--line-strong);
  position: relative;
}
.mode.is-on {
  border-color: var(--line-strong);
  box-shadow: inset 4px 0 0 var(--signal);
  position: relative;
}
.mode-text {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.15rem var(--s-3);
  flex: 1;
}
.mode-label {
  font-weight: 600;
  font-size: var(--fs-sm);
}
.mode-hint {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}

@media (max-width: 420px) {
  .mode-text {
    flex-direction: column;
  }
}
</style>
