<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import OnboardingBarcode from '../OnboardingBarcode.vue';
import { useOnboarding } from './useOnboarding';

/**
 * The dispatch label that fills in as you go. On narrow screens it collapses to a sticky mini label
 * that opens the full one (`.label-open` on the flow's root).
 */
const { step, name, formId, endpoint, destinations, maxWeightKb, tracking, test, labelOpen } = useOnboarding();
</script>

<template>
  <aside class="ob-aside" aria-label="Dispatch label preview">
    <button type="button" class="mini" :aria-expanded="labelOpen" aria-controls="ob-dlabel" @click="labelOpen = !labelOpen">
      <span class="mini-no mono">{{ formId ? `No. ${formId}` : 'New label' }}</span>
      <span class="mini-name">{{ name.trim() || 'Untitled form' }}</span>
      <span v-if="test === 'delivered'" class="tag tag-ok">Delivered</span>
      <span v-else class="mini-step mono">{{ step }}/3</span>
      <Icon :name="labelOpen ? 'minus' : 'plus'" :size="16" />
      <span class="sr-only">{{ labelOpen ? 'Hide' : 'Show' }} dispatch label</span>
    </button>

    <div id="ob-dlabel" class="dlabel" :class="{ delivered: test === 'delivered' }">
      <div class="dl-top">
        <span class="priority">Priority</span>
        <span class="caps-wide dl-title">Dispatch label</span>
      </div>

      <div class="dl-row dl-form">
        <p class="label">Form</p>
        <p class="dl-name" :class="{ blank: !name.trim() }">{{ name.trim() || 'Waiting for a name' }}</p>
      </div>

      <div class="dl-row">
        <p class="label">Post to</p>
        <p class="dl-endpoint mono" :class="{ blank: !formId }">
          <template v-if="formId">{{ endpoint.replace(/^https?:\/\//, '') }}</template>
          <template v-else>Assigned after step 1</template>
        </p>
      </div>

      <div class="dl-row">
        <p class="label">Deliver to</p>
        <ul class="dl-to" role="list">
          <li v-for="d in destinations" :key="d.key">
            <Icon :name="d.icon" :size="15" />
            <span class="dl-to-label">{{ d.label }}</span>
            <span class="dl-to-detail mono">{{ d.detail }}</span>
            <span v-if="d.note" class="tag tag-warn dl-to-note">{{ d.note }}</span>
          </li>
        </ul>
      </div>

      <div class="dl-cells">
        <div><p class="label">Service</p><p class="dl-cell">Free, for real</p></div>
        <div><p class="label">Postage</p><p class="dl-cell mono">0.00</p></div>
        <div><p class="label">Max weight</p><p class="dl-cell mono">{{ maxWeightKb }} KB</p></div>
      </div>

      <div class="dl-bar">
        <OnboardingBarcode :value="`${formId}${tracking}`" :height="46" />
        <p class="dl-track mono">{{ tracking || 'SM8 ···· ···· ··' }}</p>
      </div>

      <span v-if="test === 'delivered'" class="stamp stamp-lg dl-stamp" style="--stamp-rotate: -11deg">Delivered</span>
    </div>
  </aside>
</template>

<style scoped>
.ob-aside {
  position: sticky;
  top: var(--label-top);
}
.mini {
  display: none;
}
.dlabel {
  position: relative;
  padding: var(--s-4);
  background: var(--bg-raised);
  border: var(--bw-heavy) solid var(--line-strong);
  box-shadow: var(--shadow-label-lg);
  transform: rotate(-1deg);
  overflow: hidden;
}
.dl-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding-bottom: var(--s-3);
  border-bottom: var(--bw-heavy) solid var(--line-strong);
}
.dl-title {
  font-size: var(--fs-sm);
}
.dl-row {
  padding-block: var(--s-3);
  border-bottom: 1px solid var(--line-strong);
  min-width: 0;
}
.dl-row .label {
  color: var(--fg-muted);
}
.dl-name {
  margin-top: 0.2rem;
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(1.9rem, 3vw, 2.5rem);
  line-height: 0.95;
  overflow-wrap: anywhere;
}
.blank {
  color: var(--fg-subtle);
}
.dl-name.blank {
  font-size: 1.5rem;
  font-stretch: var(--stretch-semi);
  font-weight: 600;
  border-bottom: 2px dotted var(--line);
  padding-bottom: 0.2rem;
}
.dl-endpoint {
  margin-top: 0.25rem;
  font-size: var(--fs-xs);
  overflow-wrap: anywhere;
}
.dl-to {
  display: grid;
  gap: 0.35rem;
  margin-top: 0.4rem;
}
.dl-to li {
  display: grid;
  grid-template-columns: 1rem auto minmax(0, 1fr);
  align-items: center;
  column-gap: 0.5rem;
  font-size: var(--fs-sm);
  animation: dl-in var(--dur-3) var(--ease-out);
}
.dl-to-label {
  font-weight: 600;
}
.dl-to-detail {
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
.dl-to-note {
  grid-column: 2 / -1;
  justify-self: start;
}
@keyframes dl-in {
  from {
    opacity: 0;
    transform: translateX(-6px);
  }
}
.dl-cells {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--line-strong);
}
.dl-cells > div {
  padding: var(--s-2) var(--s-2) var(--s-2) 0;
}
.dl-cells > div + div {
  padding-left: var(--s-2);
  border-left: 1px solid var(--line-strong);
}
.dl-cells .label {
  color: var(--fg-muted);
}
.dl-cell {
  font-size: var(--fs-sm);
  font-weight: 600;
}
.dl-bar {
  padding-top: var(--s-3);
}
.dl-track {
  margin-top: 0.3rem;
  font-size: var(--fs-xs);
  letter-spacing: 0.22em;
  text-align: center;
}
.dl-stamp {
  position: absolute;
  right: 1.2rem;
  bottom: 3.6rem;
  --stamp-color: var(--ok);
  box-shadow:
    inset 0 0 0 3px var(--bg-raised),
    inset 0 0 0 5.5px var(--stamp-color);
  animation: ob-thunk 420ms var(--ease-thunk) both;
  pointer-events: none;
}
@keyframes ob-thunk {
  0% {
    transform: scale(2.3) rotate(calc(var(--stamp-rotate) - 12deg));
    opacity: 0;
  }
  55% {
    transform: scale(0.92) rotate(var(--stamp-rotate));
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(var(--stamp-rotate));
  }
}

/* ---------- Mobile: sticky mini-label ---------- */
@media (max-width: 1023px) {
  .ob-aside {
    order: -1;
    top: 0;
    z-index: 20;
    margin-inline: calc(var(--gutter) * -1);
    padding: var(--s-2) var(--gutter);
    background: color-mix(in srgb, var(--bg) 94%, transparent);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid var(--line);
  }
  .mini {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    min-height: 2.9rem;
    padding: 0.45rem 0.7rem;
    border: var(--bw-strong) solid var(--line-strong);
    background: var(--bg-raised);
    box-shadow: var(--shadow-label);
    text-align: left;
    color: var(--fg);
  }
  .mini-no {
    flex: none;
    padding: 0.1rem 0.35rem;
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--fs-2xs);
    font-weight: 600;
  }
  .mini-name {
    flex: 1;
    min-width: 0;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini-step {
    font-size: var(--fs-xs);
    color: var(--fg-muted);
  }
  .dlabel {
    display: none;
    transform: none;
    margin-top: var(--s-3);
    box-shadow: var(--shadow-label);
    max-height: calc(100dvh - 6rem);
    overflow-y: auto;
  }
  /* .label-open sits on the flow's root; scoped CSS only tags the last part of a selector, so this still matches */
  .label-open .dlabel {
    display: block;
  }
}
</style>
