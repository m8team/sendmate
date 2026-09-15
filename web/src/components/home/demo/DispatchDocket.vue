<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { useDemo } from './useDemo';

const { form, errors, stage, busy, history, fillHuman, fillBot, submit, reset } = useDemo();
</script>

<template>
  <form class="docket" novalidate aria-labelledby="docket-title" @submit.prevent="submit">
    <div class="docket-perf" aria-hidden="true"></div>
    <header class="docket-head">
      <div>
        <p class="label docket-kicker">Try it · this is a real form</p>
        <h2 id="docket-title" class="docket-title">Send yourself something</h2>
      </div>
      <span class="docket-no mono" aria-hidden="true">No. {{ String(history + 1).padStart(4, '0') }}</span>
    </header>

    <p class="docket-action mono">
      <span class="muted">&lt;form action=</span>"https://sendm8.com/f/<b>demo</b>"<span class="muted">&gt;</span>
    </p>

    <div class="docket-quick">
      <span class="label muted">Quick fill:</span>
      <button type="button" class="chip" @click="fillHuman">A nice human</button>
      <button type="button" class="chip chip-bot" @click="fillBot">A spam bot</button>
    </div>

    <div class="docket-fields">
      <div class="dfield">
        <label class="field-label" for="demo-name">Name</label>
        <input
          id="demo-name"
          v-model="form.name"
          class="dinput"
          autocomplete="name"
          placeholder="Alex Moreno"
          :aria-invalid="errors.name ? 'true' : undefined"
          :aria-describedby="errors.name ? 'demo-name-err' : undefined"
        />
        <p v-if="errors.name" id="demo-name-err" class="field-error">{{ errors.name }}</p>
      </div>
      <div class="dfield">
        <label class="field-label" for="demo-email">Email</label>
        <input
          id="demo-email"
          v-model="form.email"
          class="dinput"
          type="email"
          autocomplete="email"
          placeholder="alex@moreno.dev"
          :aria-invalid="errors.email ? 'true' : undefined"
          :aria-describedby="errors.email ? 'demo-email-err' : undefined"
        />
        <p v-if="errors.email" id="demo-email-err" class="field-error">{{ errors.email }}</p>
      </div>
      <div class="dfield dfield-wide">
        <label class="field-label" for="demo-message">Message</label>
        <textarea
          id="demo-message"
          v-model="form.message"
          class="dinput dtextarea"
          rows="3"
          placeholder="Hiya! Are you free for a project in October?"
          :aria-invalid="errors.message ? 'true' : undefined"
          :aria-describedby="errors.message ? 'demo-message-err' : undefined"
        ></textarea>
        <p v-if="errors.message" id="demo-message-err" class="field-error">{{ errors.message }}</p>
      </div>
      <div class="honeypot" aria-hidden="true">
        <label for="demo-gotcha">Leave this empty</label>
        <input id="demo-gotcha" v-model="form._gotcha" tabindex="-1" autocomplete="off" />
      </div>
    </div>

    <div class="docket-foot">
      <button v-if="stage === 'delivered' || stage === 'binned'" type="button" class="btn btn-outline btn-lg docket-send" @click="reset">
        <Icon name="refresh" /> Send another
      </button>
      <button v-else type="submit" class="btn btn-signal btn-lg docket-send" :aria-disabled="busy ? 'true' : undefined">
        <template v-if="busy">In transit…</template>
        <template v-else>Send it <Icon name="arrow-right" /></template>
      </button>
      <p class="docket-note">Nothing leaves this page. It’s a demo, the sorting happens right here.</p>
    </div>
  </form>
</template>

<style scoped>
/* The docket: a paper form lying on the poster */
.docket {
  grid-area: docket;
  position: relative;
  z-index: 2;
  align-self: start;
  margin-top: var(--docket-lift, -12.5vw);
  transition: transform var(--dur-3) var(--ease-out);
  padding: var(--s-5) var(--s-5) var(--s-5);
  background: var(--bg-raised);
  border: var(--bw-strong) solid var(--line-strong);
  box-shadow: var(--shadow-label-lg);
  transform: rotate(1.2deg);
}
.docket:focus-within {
  transform: rotate(0deg);
}
.docket-perf {
  position: absolute;
  inset: -2px -2px auto -2px;
  height: 10px;
  transform: translateY(-50%);
  background: radial-gradient(circle, var(--bg) 4px, transparent 4.5px) 0 50% / 16px 10px repeat-x;
}
.docket-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 2px solid var(--line-strong);
}
.docket-kicker {
  color: var(--signal-text);
}
.docket-title {
  margin-top: 0.3rem;
  font-family: var(--font-display);
  font-stretch: var(--stretch-semi);
  font-weight: 850;
  font-size: clamp(1.5rem, 2.2vw, 1.9rem);
  line-height: 1;
}
.docket-no {
  font-size: var(--fs-xs);
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--line-strong);
  white-space: nowrap;
}
.docket-action {
  margin-top: var(--s-3);
  font-size: var(--fs-xs);
  overflow-x: auto;
  white-space: nowrap;
}
.docket-action b {
  color: var(--signal-text);
}
.docket-quick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-3);
}
.chip {
  padding: 0.3rem 0.6rem;
  border: 1px dashed var(--line-strong);
  border-radius: var(--r-round);
  background: transparent;
  font-size: var(--fs-xs);
  font-weight: 600;
}
.chip:hover {
  background: var(--bg-sunk);
  border-style: solid;
}
.chip-bot:hover {
  color: var(--signal-text);
  border-color: var(--signal);
}
.docket-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-4) var(--s-4);
  margin-top: var(--s-4);
}
.dfield {
  display: grid;
  gap: 0.3rem;
  align-content: start;
  min-width: 0;
}
.dfield-wide {
  grid-column: 1 / -1;
}
.dinput {
  width: 100%;
  min-height: 2.6rem;
  padding: 0.45rem 0.1rem 0.4rem;
  border: 0;
  border-bottom: 2px solid var(--line-strong);
  border-radius: 0;
  background: transparent;
  font-size: 1.0625rem;
  background-image: none;
}
.dinput::placeholder {
  color: var(--fg-subtle);
}
.dinput:focus-visible {
  outline: none;
  box-shadow: none;
  border-bottom-color: var(--signal);
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}
.dinput[aria-invalid='true'] {
  border-bottom-color: var(--signal);
}
.dtextarea {
  resize: vertical;
  min-height: 4.8rem;
  line-height: 1.4;
}
.honeypot {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
.docket-foot {
  display: grid;
  gap: var(--s-2);
  margin-top: var(--s-5);
}
.docket-send {
  width: 100%;
}
.docket-note {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
  text-align: center;
}

@media (max-width: 1100px) {
  .docket {
    --docket-lift: 0;
    transform: none;
    max-width: 40rem;
    margin-inline: 0;
  }
}
@media (max-width: 760px) {
  .docket {
    padding: var(--s-4);
    box-shadow: var(--shadow-label);
  }
  .docket-fields {
    grid-template-columns: 1fr;
  }
}
</style>
