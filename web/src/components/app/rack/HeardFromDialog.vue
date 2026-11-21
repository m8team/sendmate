<script setup lang="ts">
/**
 * "How did you hear about sendm8?", asked once, in a small modal over the forms page. It lives here
 * rather than in onboarding because people who start with an email endpoint sign in straight to their
 * forms and never see onboarding. Closing it (Skip, ×, Escape or clicking outside) counts as skipping,
 * and that's remembered too, so nobody is asked twice.
 */
import { onMounted, ref } from 'vue';
import type { HeardFrom } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { invalidate } from '../../../lib/api/store';
import { HEARD_FROM_CHOICES, HEARD_FROM_DETAIL_MAX } from '../../../lib/heardFrom';

const emit = defineEmits<{ done: [answer: HeardFrom | 'skipped'] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const choice = ref<HeardFrom | null>(null);
const detail = ref('');
const busy = ref(false);
const error = ref('');
const thanked = ref(false);
let settled = false;

/** A moment after the page settles, so it doesn't pop up mid-load. */
onMounted(() => window.setTimeout(() => dialog.value?.showModal(), 600));

async function save(answer: HeardFrom | 'skipped') {
  if (busy.value || settled) return;
  busy.value = true;
  error.value = '';
  try {
    await api.heardFrom(answer, detail.value);
    settled = true;
    invalidate('me');
    if (answer === 'skipped') return finish(answer);
    thanked.value = true;
    window.setTimeout(() => finish(answer), 1200);
  } catch (err) {
    error.value = friendlyError(err);
  } finally {
    busy.value = false;
  }
}

function finish(answer: HeardFrom | 'skipped') {
  dialog.value?.close();
  emit('done', answer);
}

/** Escape and the × both close the dialog: treat that as a skip. */
function onClose() {
  if (!settled) save('skipped');
}

/** A click on the backdrop lands on the dialog element itself. */
function onBackdrop(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}
</script>

<template>
  <dialog ref="dialog" class="hf" aria-labelledby="hf-title" @close="onClose" @click="onBackdrop">
    <div class="hf-inner">
      <p v-if="thanked" class="hf-thanks" role="status"><Icon name="check" :size="16" /> Thanks, that helps.</p>
      <form v-else novalidate @submit.prevent="choice && save(choice)">
        <header class="hf-head">
          <h2 id="hf-title" class="hf-title">How did you hear about sendm8?</h2>
          <button type="button" class="icon-btn" aria-label="Close" @click="dialog?.close()"><Icon name="x" :size="16" /></button>
        </header>
        <p class="hf-sub">One question, asked once. It helps us know what’s working.</p>

        <fieldset class="hf-choices">
          <legend class="sr-only">How did you hear about sendm8?</legend>
          <label v-for="(c, i) in HEARD_FROM_CHOICES" :key="c.value" class="hf-choice">
            <input v-model="choice" type="radio" name="heard-from" class="check" :value="c.value" :autofocus="i === 0" />
            <span>{{ c.label }}</span>
          </label>
        </fieldset>

        <div v-if="choice" class="field hf-detail">
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

        <footer class="hf-actions">
          <button type="button" class="btn btn-ghost btn-sm" :aria-disabled="busy ? 'true' : undefined" @click="dialog?.close()">Skip</button>
          <button type="submit" class="btn btn-signal btn-sm" :aria-disabled="!choice || busy ? 'true' : undefined">Send</button>
        </footer>
      </form>
    </div>
  </dialog>
</template>

<style scoped>
.hf {
  /* The global reset zeroes dialog margins; put the browser's centring back. */
  inset: 0;
  margin: auto;
  width: min(26rem, calc(100vw - 2rem));
  height: fit-content;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-3);
  background: var(--bg-raised);
  color: var(--fg);
  box-shadow: 0 16px 48px rgb(0 0 0 / 0.28);
}
.hf::backdrop {
  background: color-mix(in srgb, var(--ink-900) 45%, transparent);
}
.hf[open] {
  animation: hf-in var(--dur-3) var(--ease-out);
}
@keyframes hf-in {
  from {
    transform: translateY(6px);
    opacity: 0;
  }
}
.hf-inner {
  padding: var(--s-4);
}
.hf-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--s-3);
}
.hf-title {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
}
.hf-head .icon-btn {
  margin: -0.25rem -0.25rem 0 0;
  color: var(--fg-muted);
}
.hf-sub {
  margin-top: var(--s-1);
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
.hf-choices {
  display: grid;
  margin: var(--s-4) 0 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  overflow: hidden;
}
.hf-choice {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-3);
  cursor: pointer;
}
.hf-choice + .hf-choice {
  border-top: 1px solid var(--line);
}
.hf-choice:hover,
.hf-choice:has(input:checked) {
  background: var(--bg-sunk);
}
.hf-detail {
  margin-top: var(--s-4);
}
.hf-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-2);
  margin-top: var(--s-4);
}
.hf-thanks {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  color: var(--ok);
}
@media (prefers-reduced-motion: reduce) {
  .hf[open] {
    animation: none;
  }
}
</style>
