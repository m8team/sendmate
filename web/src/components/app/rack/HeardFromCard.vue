<script setup lang="ts">
/**
 * "How did you hear about sendm8?", asked once on the rack. It lives here rather than in onboarding
 * because people who start with an email endpoint sign in straight to their forms and never see onboarding.
 * Skipping is remembered too, so nobody is asked twice.
 */
import { ref } from 'vue';
import type { HeardFrom } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { invalidate } from '../../../lib/api/store';
import { HEARD_FROM_CHOICES, HEARD_FROM_DETAIL_MAX } from '../../../lib/heardFrom';

const emit = defineEmits<{ done: [answer: HeardFrom | 'skipped'] }>();

const choice = ref<HeardFrom | null>(null);
const detail = ref('');
const busy = ref(false);
const error = ref('');
const thanked = ref(false);

async function save(answer: HeardFrom | 'skipped') {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.heardFrom(answer, detail.value);
    invalidate('me');
    if (answer === 'skipped') return emit('done', answer);
    thanked.value = true;
    window.setTimeout(() => emit('done', answer), 1600);
  } catch (err) {
    error.value = friendlyError(err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="hf" aria-labelledby="hf-title">
    <p v-if="thanked" class="hf-thanks" role="status"><Icon name="check" :size="18" /> Thanks. That genuinely helps.</p>

    <form v-else class="hf-form" novalidate @submit.prevent="choice && save(choice)">
      <div class="hf-head">
        <p class="label hf-kicker">One quick question</p>
        <h2 id="hf-title" class="hf-title">How did you hear about sendm8?</h2>
      </div>

      <fieldset class="hf-choices">
        <legend class="sr-only">How did you hear about sendm8?</legend>
        <label v-for="c in HEARD_FROM_CHOICES" :key="c.value" class="hf-choice" :class="{ on: choice === c.value }">
          <input v-model="choice" type="radio" name="heard-from" :value="c.value" class="sr-only" />
          <span>{{ c.label }}</span>
        </label>
      </fieldset>

      <div v-if="choice" class="hf-detail">
        <label class="field-label" for="hf-detail">Anything to add? <span class="muted">(optional)</span></label>
        <input
          id="hf-detail"
          v-model="detail"
          class="input"
          :maxlength="HEARD_FROM_DETAIL_MAX"
          :placeholder="choice === 'friend' ? 'Who should we thank?' : choice === 'ai_assistant' ? 'Which one?' : 'Which site, post or person?'"
        />
      </div>

      <p v-if="error" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>

      <div class="hf-actions">
        <button type="submit" class="btn btn-signal btn-sm" :aria-disabled="!choice || busy ? 'true' : undefined">Send</button>
        <button type="button" class="btn btn-ghost btn-sm" :aria-disabled="busy ? 'true' : undefined" @click="save('skipped')">Skip</button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.hf {
  margin-bottom: var(--s-6);
  padding: var(--s-4) var(--s-5);
  border: var(--bw-strong) solid var(--line-strong);
  border-left: 6px solid var(--signal);
  background: var(--bg-raised);
}
.hf-form {
  display: grid;
  gap: var(--s-3);
}
.hf-kicker {
  color: var(--signal-text);
}
.hf-title {
  font-family: var(--font-display);
  font-stretch: var(--stretch-semi);
  font-weight: 800;
  font-size: clamp(1.25rem, 2.2vw, 1.6rem);
  line-height: 1.15;
}
.hf-choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  border: 0;
  padding: 0;
  margin: 0;
}
.hf-choice {
  display: inline-flex;
  align-items: center;
  min-height: 2.5rem;
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--line-strong);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}
.hf-choice:hover {
  background: var(--bg);
}
.hf-choice.on {
  background: var(--fg);
  color: var(--bg);
  border-color: var(--fg);
}
.hf-choice:has(input:focus-visible) {
  outline: 2px solid var(--focus, var(--signal));
  outline-offset: 2px;
}
.hf-detail {
  display: grid;
  gap: var(--s-1);
  max-width: 32rem;
}
.hf-actions {
  display: flex;
  gap: var(--s-2);
}
.hf-thanks {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  font-weight: 600;
  color: var(--ok);
}
@media (prefers-reduced-motion: reduce) {
  .hf-choice {
    transition: none;
  }
}
</style>
