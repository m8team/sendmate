<script setup lang="ts">
import OnboardingProgress from './onboarding/OnboardingProgress.vue';
import StepName from './onboarding/StepName.vue';
import StepDestinations from './onboarding/StepDestinations.vue';
import StepSnippet from './onboarding/StepSnippet.vue';
import DispatchLabel from './onboarding/DispatchLabel.vue';
import { provideOnboarding } from './onboarding/useOnboarding';

const props = defineProps<{
  /** Build-time fallback until /api/me brings the deployment's limit. */
  bodyKb: number;
}>();

const { labelOpen } = provideOnboarding(props.bodyKb);
</script>

<template>
  <div class="ob" :class="{ 'label-open': labelOpen }">
    <OnboardingProgress />

    <div class="ob-grid">
      <div class="ob-steps">
        <StepName />
        <StepDestinations />
        <StepSnippet />
      </div>

      <DispatchLabel />
    </div>
  </div>
</template>

<style scoped>
.ob {
  --label-top: var(--s-5);
}

.ob-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(19rem, 25rem);
  gap: clamp(1.5rem, 4vw, 4rem);
  align-items: start;
  margin-top: var(--s-6);
}

.ob-steps {
  display: grid;
  gap: var(--s-3);
}

@media (max-width: 1023px) {
  .ob-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s-4);
  }
}
</style>
