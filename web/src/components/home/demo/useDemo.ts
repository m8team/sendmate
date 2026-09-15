import { computed, inject, nextTick, onBeforeUnmount, provide, reactive, ref, type InjectionKey } from 'vue';
import {
  easeOutCubic,
  hasReached,
  initialsOf,
  makeTracking,
  progressFor,
  SPAM_THRESHOLD,
  spamCheck,
  STAGE_TIMINGS,
  statusText,
  validateDocket,
  type DocketErrors,
  type DocketFields,
  type SentParcel,
  type Stage,
} from './demoLogic';

/**
 * The demo's state machine: docket → sorting line → email + Discord.
 * `LiveDemo` creates it with `provideDemo()`; the pieces read it with `useDemo()`.
 */
function createDemo() {
  const form = reactive<DocketFields>({ name: '', email: '', message: '', _gotcha: '' });
  const errors = reactive<DocketErrors>({});
  const stage = ref<Stage>('idle');
  const busy = ref(false);
  const tracking = ref('');
  const receivedAt = ref('');
  const score = ref(0);
  const shownScore = ref(0);
  const reasons = ref<string[]>([]);
  const sent = ref<SentParcel | null>(null);
  const history = ref(0);
  /** Whether the delivered email is expanded in the mock inbox. */
  const openEmail = ref(true);
  /** The sorting line band, so narrow screens can scroll it into view. */
  const lineEl = ref<HTMLElement | null>(null);
  const timers: number[] = [];

  const reached = (s: Stage) => hasReached(stage.value, s);
  const progress = computed(() => progressFor(stage.value));
  const isSpam = computed(() => stage.value === 'binned');
  const delivered = computed(() => stage.value === 'delivered');
  const status = computed(() =>
    statusText(stage.value, { busy: busy.value, tracking: tracking.value, receivedAt: receivedAt.value, score: score.value }),
  );
  const initials = computed(() => initialsOf(sent.value?.name));

  const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clearErrors() {
    delete errors.name;
    delete errors.email;
    delete errors.message;
  }

  function fillHuman() {
    form.name = 'Alex Moreno';
    form.email = 'alex@moreno.dev';
    form.message = 'Hiya! Loved the portfolio. Are you free for a quick project in October?';
    form._gotcha = '';
    clearErrors();
  }

  function fillBot() {
    form.name = 'Top SEO Deals';
    form.email = 'winner@mailinator.com';
    form.message = 'GUARANTEED page 1 on Google + FREE crypto!! https://spam.example https://bit.ly/x';
    form._gotcha = 'http://i-am-a-bot.example';
    clearErrors();
  }

  function validate() {
    clearErrors();
    Object.assign(errors, validateDocket(form));
    return !errors.name && !errors.email && !errors.message;
  }

  function later(fn: () => void, ms: number) {
    timers.push(window.setTimeout(fn, reduced() ? Math.min(ms, 60) : ms));
  }

  function countScore(target: number) {
    if (reduced()) {
      shownScore.value = target;
      return;
    }
    const start = performance.now();
    const dur = 650;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      shownScore.value = Math.round(target * easeOutCubic(p) * 100) / 100;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async function submit() {
    if (busy.value) return;
    if (!validate()) {
      await nextTick();
      const first = document.querySelector<HTMLElement>('.docket [aria-invalid="true"]');
      first?.focus();
      return;
    }
    busy.value = true;
    timers.splice(0).forEach(clearTimeout);
    stage.value = 'idle';
    shownScore.value = 0;
    tracking.value = makeTracking();
    const now = new Date();
    receivedAt.value = now.toLocaleTimeString('en-GB', { hour12: false });
    const check = spamCheck(form);
    score.value = check.score;
    reasons.value = check.why;

    // On narrow screens the sorting line sits below the form: bring it into view.
    if (lineEl.value && window.innerWidth < 1100) {
      const r = lineEl.value.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.6) lineEl.value.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    }

    later(() => (stage.value = 'received'), STAGE_TIMINGS.received);
    later(() => {
      stage.value = 'checked';
      countScore(check.score);
    }, STAGE_TIMINGS.checked);
    if (check.score >= SPAM_THRESHOLD) {
      later(() => {
        stage.value = 'binned';
        busy.value = false;
      }, STAGE_TIMINGS.stored);
      return;
    }
    later(() => (stage.value = 'stored'), STAGE_TIMINGS.stored);
    later(() => {
      sent.value = {
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
        at: receivedAt.value.slice(0, 5),
        tracking: tracking.value,
      };
      history.value++;
      openEmail.value = true;
      stage.value = 'delivered';
      busy.value = false;
    }, STAGE_TIMINGS.delivered);
  }

  function reset() {
    timers.splice(0).forEach(clearTimeout);
    stage.value = 'idle';
    busy.value = false;
    form.name = '';
    form.email = '';
    form.message = '';
    form._gotcha = '';
    shownScore.value = 0;
    nextTick(() => document.getElementById('demo-name')?.focus());
  }

  onBeforeUnmount(() => timers.forEach(clearTimeout));

  return {
    form,
    errors,
    stage,
    busy,
    tracking,
    receivedAt,
    score,
    shownScore,
    reasons,
    sent,
    history,
    openEmail,
    lineEl,
    reached,
    progress,
    isSpam,
    delivered,
    status,
    initials,
    fillHuman,
    fillBot,
    submit,
    reset,
  };
}

export type DemoState = ReturnType<typeof createDemo>;

const DEMO_KEY: InjectionKey<DemoState> = Symbol('sendm8-demo');

export function provideDemo(): DemoState {
  const demo = createDemo();
  provide(DEMO_KEY, demo);
  return demo;
}

export function useDemo(): DemoState {
  const demo = inject(DEMO_KEY);
  if (!demo) throw new Error('useDemo() must be used inside <LiveDemo>');
  return demo;
}
