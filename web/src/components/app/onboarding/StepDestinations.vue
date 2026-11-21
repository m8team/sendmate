<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import OnboardingStep from './OnboardingStep.vue';
import EmailDestination from './EmailDestination.vue';
import ChannelDestination from './ChannelDestination.vue';
import { channelOrder } from './onboardingLogic';
import { useOnboarding } from './useOnboarding';

const { step, reached, summary, go, emailOn, chosenAddress, step2Error, saving, submitDestinations } = useOnboarding();

const edit = computed(() => (step.value !== 2 && reached.value >= 2 ? { label: 'Edit', srLabel: 'destinations' } : undefined));
</script>

<template>
  <OnboardingStep :n="2" heading="Where submissions go" :summary="step !== 2 && reached >= 3 ? summary[2] : undefined" :action="edit" @action="go(2)">
    <form v-if="step === 2" class="step-body" novalidate @submit.prevent="submitDestinations">
      <p class="step-intro">Submissions always go to your inbox. Add anywhere else you want them. You can change this later.</p>

      <EmailDestination />

      <p class="dest-group">Other channels <span class="muted">(optional)</span></p>
      <ChannelDestination v-for="t in channelOrder" :key="t" :t="t" />

      <p v-if="emailOn && chosenAddress && !chosenAddress.verified" class="field-hint">
        <b>{{ chosenAddress.email }}</b> isn’t verified yet. Emails start once it is.
      </p>

      <div v-if="step2Error" class="notice notice-signal" role="alert">
        <span class="notice-icon"><Icon name="alert" :size="18" /></span>
        <p class="notice-title">Not all set up yet</p>
        <div class="notice-body"><p>{{ step2Error }}</p></div>
      </div>

      <div class="step-actions">
        <button type="button" class="btn btn-ghost" @click="go(1)"><Icon name="arrow-left" /> Back</button>
        <button type="submit" class="btn btn-signal" :aria-disabled="saving ? 'true' : undefined">
          <template v-if="saving">Saving…</template>
          <template v-else>Continue</template>
        </button>
      </div>
    </form>
  </OnboardingStep>
</template>

<style scoped>
.dest-group {
  margin-top: var(--s-2);
  font-size: var(--fs-xs);
  font-weight: 600;
}
</style>
