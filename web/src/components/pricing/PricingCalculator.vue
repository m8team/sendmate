<script setup lang="ts">
import { computed, ref } from 'vue';
import { limits } from '../../config/site';
import CalcPresets from './calculator/CalcPresets.vue';
import CalcSliders from './calculator/CalcSliders.vue';
import CalcModes from './calculator/CalcModes.vue';
import CalcVerdict from './calculator/CalcVerdict.vue';
import CalcReceipt from './calculator/CalcReceipt.vue';
import { STEPS, estimate, verdictFor, type Mode, type Preset } from './calculator/calcLogic';

const stepIndex = ref(STEPS.indexOf(8));
const forms = ref(2);
const mode = ref<Mode>('ours');

const perForm = computed(() => STEPS[stepIndex.value]);
const input = computed(() => ({ perForm: perForm.value, forms: forms.value, mode: mode.value }));
const result = computed(() => estimate(input.value, limits));
const verdict = computed(() => verdictFor(input.value, limits));

function applyPreset(p: Preset) {
  stepIndex.value = STEPS.indexOf(p.perForm);
  forms.value = p.forms;
}
</script>

<template>
  <div class="calc">
    <!-- Controls -->
    <form class="counter" @submit.prevent aria-labelledby="calc-title">
      <CalcPresets :per-form="perForm" :forms="forms" @apply="applyPreset" />
      <CalcSliders v-model:step-index="stepIndex" v-model:forms="forms" />
      <CalcModes v-model="mode" :cap="limits.emailsPerDay" />

      <p class="mini-verdict" :class="`tone-${verdict.tone}`" aria-hidden="true">
        <span class="label">Verdict</span>
        <span class="mini-text">{{ verdict.head }}</span>
      </p>
    </form>

    <!-- Readout -->
    <div class="readout">
      <CalcVerdict :verdict="verdict" />
      <CalcReceipt :result="result" :mode="mode" :limits="limits" />
    </div>
  </div>
</template>

<style scoped>
.calc {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  gap: clamp(1.5rem, 4vw, 4rem);
  align-items: start;
}

/* ---------- Controls ---------- */
.counter {
  display: grid;
  gap: var(--s-6);
  padding: clamp(1.25rem, 3vw, 2rem);
  border: 2px solid var(--line-strong);
  background: var(--bg-raised);
  box-shadow: var(--shadow-label-lg);
}

.mini-verdict {
  display: none;
  position: sticky;
  bottom: 0;
  z-index: 2;
  align-items: baseline;
  gap: var(--s-3);
  margin: 0 calc(clamp(1.25rem, 3vw, 2rem) * -1) calc(clamp(1.25rem, 3vw, 2rem) * -1);
  padding: 0.75rem clamp(1.25rem, 3vw, 2rem);
  background: var(--fg);
  color: var(--bg);
  border-top: 2px solid var(--line-strong);
}
.mini-verdict .label {
  flex: none;
  padding: 0.15rem 0.35rem;
  background: var(--accent);
  color: var(--on-accent);
}
.mini-text {
  font-family: var(--font-display);
  font-stretch: var(--stretch-semi);
  font-weight: 800;
  font-size: var(--fs-sm);
  line-height: 1.2;
}

/* ---------- Readout ---------- */
.readout {
  display: grid;
  gap: var(--s-5);
  min-width: 0;
}

@media (max-width: 960px) {
  .calc {
    grid-template-columns: 1fr;
  }
  .mini-verdict {
    display: flex;
  }
}
</style>
