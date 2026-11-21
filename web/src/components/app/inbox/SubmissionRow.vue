<script setup lang="ts">
/** One submission in the list: select checkbox, sender, preview, status chip and star. */
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
        <time class="row-time" :datetime="isoDate(s.createdAt)">{{ ago(s.createdAt, now) }}</time>
      </span>
      <span class="row-prev">{{ preview(s) || '(no message)' }}</span>
      <span v-if="s.files.length || chip" class="row-foot">
        <span v-if="s.files.length" class="row-clip"><Icon name="paperclip" :size="13" label="Has attachment" /></span>
        <span v-if="chip" class="chip" :class="chip.cls">{{ chip.text }}</span>
      </span>
    </button>
    <button type="button" class="row-star" :aria-pressed="s.starred" :aria-label="`Star submission from ${sender(s)}`" @click="emit('star')">
      <Icon name="star" :size="16" />
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
  transition: background-color var(--dur-1);
}
.row:hover {
  background: var(--bg-sunk);
}
.row.is-open {
  background: var(--bg-sunk);
  box-shadow: inset 2px 0 0 var(--fg);
}
.row.is-sel {
  background: color-mix(in srgb, var(--fg) 7%, var(--bg));
}
.row-check {
  margin: 0.8rem 0 0 0.8rem;
  position: relative;
  z-index: 1;
}
/* On mouse screens the checkbox waits until you hover or start selecting. */
@media (hover: hover) and (pointer: fine) {
  .row-check {
    opacity: 0;
  }
  .row:hover .row-check,
  .row.is-sel .row-check,
  .row-check:focus-visible {
    opacity: 1;
  }
}
/* 24px minimum touch target on phones and tablets. */
@media (pointer: coarse) {
  .row-check {
    width: 1.5rem;
    height: 1.5rem;
    margin: 0.65rem 0 0 0.7rem;
  }
}
.row-main {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  padding: 0.6rem 0.3rem 0.6rem 0.6rem;
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
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--fg);
}
.row-from {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--fg-muted);
}
.is-unread .row-from {
  font-weight: 650;
  color: var(--fg);
}
.row-time {
  flex: none;
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  color: var(--fg-muted);
}
.row-prev {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: var(--fs-xs);
  line-height: 1.45;
  color: var(--fg-muted);
}
.is-unread .row-prev {
  color: var(--fg);
}
.is-blocked .row-from,
.is-blocked .row-prev {
  color: var(--fg-subtle);
}
.row-foot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.2rem;
  min-width: 0;
}
.row-clip {
  display: inline-flex;
  color: var(--fg-muted);
}
.chip {
  padding: 0 0.35rem;
  border-radius: var(--r-2);
  font-size: var(--fs-2xs);
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
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
  width: 2rem;
  height: 2rem;
  margin: 0.35rem 0.3rem 0 0;
  border: 0;
  border-radius: var(--r-2);
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
  stroke: color-mix(in srgb, var(--accent) 60%, var(--fg));
}

@media (max-width: 720px) {
  .row.is-open {
    box-shadow: none;
    background: transparent;
  }
  .row-main {
    padding-block: 0.8rem;
  }
  .row-prev {
    font-size: var(--fs-sm);
  }
}
</style>
