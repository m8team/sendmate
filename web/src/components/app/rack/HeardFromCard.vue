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
    <p v-if="thanked" class="hf-thanks" role="status"><Icon name="check" :size="16" /> Thanks, that helps.</p>
    <form v-else class="hf-form" novalidate @submit.prevent="choice && save(choice)">
      <label id="hf-title" for="hf-choice" class="hf-q">How did you hear about sendm8?</label>
      <select id="hf-choice" v-model="choice" class="select hf-select">
        <option :value="null" disabled>Choose one</option>
        <option v-for="c in HEARD_FROM_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>
      <template v-if="choice">
        <label class="sr-only" for="hf-detail">Anything to add? (optional)</label>
        <input
          id="hf-detail"
          v-model="detail"
          class="input hf-detail"
          :maxlength="HEARD_FROM_DETAIL_MAX"
          :placeholder="choice === 'friend' ? 'Who should we thank? (optional)' : choice === 'ai_assistant' ? 'Which one? (optional)' : 'Where? (optional)'"
        />
        <button type="submit" class="btn btn-outline btn-sm" :aria-disabled="busy ? 'true' : undefined">Send</button>
      </template>
      <button type="button" class="icon-btn hf-skip" aria-label="Skip this question" title="Skip" :aria-disabled="busy ? 'true' : undefined" @click="save('skipped')">
        <Icon name="x" :size="16" />
      </button>
      <p v-if="error" class="field-error hf-error" role="alert"><Icon name="alert" :size="14" /> {{ error }}</p>
    </form>
  </section>
</template>

<style scoped>
.hf {
  margin-bottom: var(--s-4);
  padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4);
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  background: var(--bg-sunk);
}
.hf-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-3);
}
.hf-q {
  font-weight: 500;
}
.hf-select {
  width: auto;
  min-width: 12rem;
  min-height: 2rem;
  background-color: var(--bg);
}
.hf-detail {
  flex: 1 1 12rem;
  width: auto;
  min-height: 2rem;
  background: var(--bg);
}
.hf-skip {
  margin-left: auto;
  color: var(--fg-muted);
}
.hf-error {
  flex-basis: 100%;
}
.hf-thanks {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: 2rem;
  color: var(--ok);
}
</style>
