<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import OnboardingStep from './OnboardingStep.vue';
import { NAME_MAX } from './onboardingLogic';
import { useOnboarding } from './useOnboarding';

const { step, summary, go, name, nameError, creating, submitName } = useOnboarding();

const edit = computed(() => (step.value !== 1 ? { label: 'Edit', srLabel: 'name' } : undefined));
</script>

<template>
  <OnboardingStep :n="1" heading="Name it" :summary="step !== 1 ? summary[1] : undefined" :action="edit" @action="go(1)">
    <form v-if="step === 1" class="step-body" novalidate @submit.prevent="submitName">
      <div class="field">
        <label class="field-label" for="ob-name">Form name</label>
        <input
          id="ob-name"
          v-model="name"
          class="input"
          autocomplete="off"
          placeholder="Portfolio contact"
          :maxlength="NAME_MAX + 20"
          :aria-invalid="nameError ? 'true' : undefined"
          :aria-describedby="nameError ? 'ob-name-hint ob-name-err' : 'ob-name-hint'"
        />
        <p id="ob-name-hint" class="field-hint">Only you see this. Call it whatever you’d call it in the group chat.</p>
        <p v-if="nameError" id="ob-name-err" class="field-error"><Icon name="alert" :size="14" /> {{ nameError }}</p>
      </div>
      <div class="step-actions">
        <button type="submit" class="btn btn-signal" :aria-disabled="creating ? 'true' : undefined">
          <template v-if="creating">Making your endpoint…</template>
          <template v-else>Next: where it goes <Icon name="arrow-right" /></template>
        </button>
      </div>
    </form>
  </OnboardingStep>
</template>
