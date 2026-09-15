<script setup lang="ts">
/** One letter in the list: pick checkbox, sender, preview, tracking number, status chip and star. */
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import type { Submission } from '../../../lib/api/types';
import { ago, isoDate, preview, sender } from '../InboxUtils';
import { rowChip } from './rows';

const props = defineProps<{ s: Submission; now: number; open: boolean; picked: boolean; tabStop: boolean }>();
const emit = defineEmits<{ open: []; focus: []; pick: []; star: [] }>();

const unread = computed(() => !props.s.read && props.s.status === 'ok');
const chip = computed(() => rowChip(props.s));
</script>

<template>
  <li
    :data-id="s.id"
    class="row"
    :class="{
      'is-unread': unread,
      'is-open': open,
      'is-sel': picked,
      'is-blocked': s.status !== 'ok',
    }"
  >
    <input type="checkbox" class="check row-check" :checked="picked" :aria-label="`Select submission from ${sender(s)}`" @change="emit('pick')" />
    <button type="button" class="row-main" :tabindex="tabStop ? 0 : -1" :aria-current="open ? 'true' : undefined" @click="emit('open')" @focus="emit('focus')">
      <span class="row-top">
        <span v-if="unread" class="row-dot" aria-hidden="true"></span>
        <span v-if="unread" class="sr-only">Unread.</span>
        <span class="row-from">{{ sender(s) }}</span>
        <time class="row-time mono" :datetime="isoDate(s.createdAt)">{{ ago(s.createdAt, now) }}</time>
      </span>
      <span class="row-prev">{{ preview(s) || '(no message)' }}</span>
      <span class="row-foot">
        <span class="row-track mono">{{ s.tracking }}</span>
        <span v-if="s.files.length" class="row-clip"><Icon name="paperclip" :size="14" label="Has attachment" /></span>
        <span v-if="chip" class="chip mono" :class="chip.cls">{{ chip.text }}</span>
      </span>
    </button>
    <button type="button" class="row-star" :aria-pressed="s.starred" :aria-label="`Star submission from ${sender(s)}`" @click="emit('star')">
      <Icon name="star" :size="18" />
    </button>
  </li>
</template>

<style scoped>
.row {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  border-bottom: 1px solid var(--line);
  background: var(--bg-sunk);
  transition: background-color var(--dur-1);
}
.row:hover {
  background: color-mix(in srgb, var(--bg-raised) 60%, var(--bg-sunk));
}
.row.is-open {
  background: var(--bg);
  box-shadow: inset 4px 0 0 var(--signal);
}
.row.is-sel {
  background: color-mix(in srgb, var(--accent) 22%, var(--bg-sunk));
}
.row-check {
  margin: 0.95rem 0 0 0.85rem;
  position: relative;
  z-index: 1;
}
/* 24px minimum touch target on phones and tablets. */
@media (pointer: coarse) {
  .row-check {
    width: 1.5rem;
    height: 1.5rem;
    margin: 0.75rem 0 0 0.7rem;
  }
}
.row-main {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
  padding: 0.75rem 0.4rem 0.75rem 0.65rem;
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--fg);
}
.row-main:focus-visible {
  outline-offset: -2px;
  box-shadow: inset 0 0 0 4px var(--focus-halo);
}
.row-top {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  min-width: 0;
}
.row-dot {
  flex: none;
  align-self: center;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--signal);
}
.row-from {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-sm);
  font-weight: 500;
}
.is-unread .row-from {
  font-weight: 700;
}
.row-time {
  flex: none;
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
}
.is-unread .row-time {
  color: var(--fg);
  font-weight: 600;
}
.row-prev {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: var(--fs-xs);
  line-height: 1.4;
  color: var(--fg-muted);
}
.is-blocked .row-from,
.is-blocked .row-prev {
  color: var(--fg-subtle);
}
.row-foot {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.15rem;
  min-width: 0;
}
.row-track {
  font-size: 0.65rem;
  letter-spacing: 0.03em;
  color: var(--fg-subtle);
  white-space: nowrap;
}
.row-clip {
  display: inline-flex;
  color: var(--fg-muted);
}
.chip {
  padding: 0.05rem 0.35rem;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  border: 1px solid currentColor;
}
.chip-spam {
  color: var(--signal-text);
  background: var(--signal-wash);
}
.chip-held {
  /* Nudged toward the text colour: darker on paper, lighter at night, so it clears AA on every row state. */
  color: color-mix(in srgb, var(--warn) 78%, var(--fg));
  background: var(--warn-wash);
}
.row-star {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  margin: 0.35rem 0.3rem 0 0;
  border: 0;
  background: transparent;
  color: var(--fg-subtle);
}
.row-star:hover {
  color: var(--fg);
}
.row-star[aria-pressed='true'] {
  color: var(--fg);
}
.row-star[aria-pressed='true'] svg {
  fill: var(--accent);
}
.row-star svg {
  transition: transform var(--dur-2) var(--ease-thunk);
}
.row-star[aria-pressed='true'] svg {
  transform: rotate(-12deg) scale(1.08);
}

@media (max-width: 720px) {
  .row.is-open {
    box-shadow: none;
    background: var(--bg-sunk);
  }
  .row-main {
    padding-block: 0.9rem;
  }
  .row-prev {
    font-size: var(--fs-sm);
  }
}
</style>
