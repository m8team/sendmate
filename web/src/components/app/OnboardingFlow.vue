<script setup lang="ts">
import StepName from './onboarding/StepName.vue';
import StepDestinations from './onboarding/StepDestinations.vue';
import StepSnippet from './onboarding/StepSnippet.vue';
import { provideOnboarding } from './onboarding/useOnboarding';

/** New form: three steps in one column. Each finished step folds down to a one-line summary. */
provideOnboarding();
</script>

<template>
  <div class="ob">
    <StepName />
    <StepDestinations />
    <StepSnippet />
  </div>
</template>

<style scoped>
.ob {
  display: grid;
  gap: var(--s-3);
  max-width: 46rem;
}
</style>
