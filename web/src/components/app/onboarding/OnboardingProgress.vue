<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { STEPS, type Step } from './onboardingLogic';
import { useOnboarding } from './useOnboarding';

const { step, stepState } = useOnboarding();

const stepTitles: Record<Step, string> = { 1: 'Name it', 2: 'Where it goes', 3: 'Grab the snippet' };
</script>

<template>
  <ol class="ob-progress" role="list" aria-label="Progress">
    <li v-for="n in STEPS" :key="n" :class="['ob-pstep', `is-${stepState(n)}`]" :aria-current="step === n ? 'step' : undefined">
      <span class="ob-pno mono" aria-hidden="true">
        <Icon v-if="stepState(n) === 'done'" name="check" :size="14" :stroke-width="2.5" />
        <template v-else>0{{ n }}</template>
      </span>
      <span class="ob-pname">
        {{ stepTitles[n] }}
        <span class="sr-only">{{ stepState(n) === 'done' ? '(done)' : stepState(n) === 'current' ? '(current step)' : '(not started)' }}</span>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.ob-progress {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  list-style: none;
  padding: 0;
  border-top: var(--bw-strong) solid var(--line-strong);
}
.ob-pstep {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-3) var(--s-3) 0;
  color: var(--fg-muted);
  font-size: var(--fs-sm);
  font-weight: 600;
}
.ob-pstep::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 5px;
  background: transparent;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--dur-3) var(--ease-out);
}
.ob-pstep.is-done::before,
.ob-pstep.is-current::before {
  background: var(--fg);
  transform: scaleX(1);
}
.ob-pstep.is-current::before {
  background: var(--signal);
}
.ob-pno {
  flex: none;
  display: grid;
  place-items: center;
  width: 1.8rem;
  height: 1.8rem;
  border: 1.5px solid var(--line);
  border-radius: 50%;
  font-size: var(--fs-2xs);
}
.ob-pstep.is-current {
  color: var(--fg);
}
.ob-pstep.is-current .ob-pno {
  background: var(--signal);
  border-color: var(--signal);
  color: var(--on-signal);
}
.ob-pstep.is-done {
  color: var(--fg);
}
.ob-pstep.is-done .ob-pno {
  background: var(--fg);
  border-color: var(--fg);
  color: var(--bg);
}

@media (max-width: 1023px) {
  .ob-progress {
    font-size: var(--fs-xs);
  }
}
@media (max-width: 560px) {
  .ob-pstep {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.35rem;
    font-size: var(--fs-xs);
    line-height: 1.2;
  }
}
</style>
