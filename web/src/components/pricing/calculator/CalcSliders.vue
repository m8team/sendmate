<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import { MAX_FORMS, STEPS, clampForms, n } from './calcLogic';

/** Index into STEPS for "submissions a day, per form". */
const stepIndex = defineModel<number>('stepIndex', { required: true });
const forms = defineModel<number>('forms', { required: true });

const perForm = computed(() => STEPS[stepIndex.value]);

function setForms(v: number) {
  forms.value = clampForms(v);
}
</script>

<template>
  <div class="ctl">
    <div class="ctl-top">
      <label class="field-label" for="calc-per-form">Submissions a day, per form</label>
      <output class="ctl-value" for="calc-per-form">{{ n(perForm) }}</output>
    </div>
    <input
      id="calc-per-form"
      v-model.number="stepIndex"
      class="range"
      type="range"
      min="0"
      :max="STEPS.length - 1"
      step="1"
      :aria-valuetext="`${perForm} submissions a day per form`"
      :style="{ '--fill': `${(stepIndex / (STEPS.length - 1)) * 100}%` }"
    />
    <div class="range-scale mono" aria-hidden="true">
      <span>0</span><span>10</span><span>50</span><span>{{ STEPS[STEPS.length - 1] }}</span>
    </div>
    <p class="field-hint">On a normal day. A contact form on a personal site usually gets a handful.</p>
  </div>

  <div class="ctl">
    <div class="ctl-top">
      <label class="field-label" for="calc-forms">Number of forms</label>
    </div>
    <div class="stepper">
      <button type="button" class="icon-btn" :disabled="forms <= 1" aria-label="One fewer form" @click="setForms(forms - 1)">
        <Icon name="minus" :size="18" />
      </button>
      <input
        id="calc-forms"
        class="input mono stepper-input"
        type="number"
        inputmode="numeric"
        min="1"
        :max="MAX_FORMS"
        :value="forms"
        @change="setForms(Number(($event.target as HTMLInputElement).value))"
      />
      <button type="button" class="icon-btn" :disabled="forms >= MAX_FORMS" aria-label="One more form" @click="setForms(forms + 1)">
        <Icon name="plus" :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ctl {
  display: grid;
  gap: var(--s-2);
}
.ctl-top {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: var(--s-3);
}
.ctl-value {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: 3rem;
  line-height: 0.8;
  font-variant-numeric: tabular-nums;
}

.range {
  --fill: 0%;
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 2rem;
  margin: 0;
  background: transparent;
  cursor: pointer;
}
.range::-webkit-slider-runnable-track {
  height: 14px;
  border: 1.5px solid var(--line-strong);
  background:
    linear-gradient(90deg, var(--fg) 0 var(--fill), transparent var(--fill)),
    repeating-linear-gradient(90deg, transparent 0 9px, var(--line) 9px 10px);
}
.range::-moz-range-track {
  height: 11px;
  border: 1.5px solid var(--line-strong);
  background: repeating-linear-gradient(90deg, transparent 0 9px, var(--line) 9px 10px);
}
.range::-moz-range-progress {
  height: 11px;
  background: var(--fg);
}
.range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 1.1rem;
  height: 2rem;
  margin-top: calc((14px - 3px - 2rem) / 2);
  border: 2px solid var(--line-strong);
  border-radius: var(--r-1);
  background: var(--signal);
  box-shadow: 2px 2px 0 var(--line-strong);
}
.range::-moz-range-thumb {
  width: 1.1rem;
  height: 2rem;
  border: 2px solid var(--line-strong);
  border-radius: var(--r-1);
  background: var(--signal);
  box-shadow: 2px 2px 0 var(--line-strong);
}
.range:focus-visible {
  outline: none;
  box-shadow: none;
}
.range:focus-visible::-webkit-slider-thumb {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px var(--focus-halo);
}
.range:focus-visible::-moz-range-thumb {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px var(--focus-halo);
}
.range-scale {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
}

.stepper {
  display: flex;
  align-items: stretch;
  gap: var(--s-2);
}
.stepper .icon-btn {
  width: 2.9rem;
  height: 2.9rem;
  border-color: var(--line-strong);
}
.stepper .icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.stepper-input {
  width: 5.5rem;
  text-align: center;
  font-size: var(--fs-lg);
  -moz-appearance: textfield;
}
.stepper-input::-webkit-outer-spin-button,
.stepper-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
</style>
