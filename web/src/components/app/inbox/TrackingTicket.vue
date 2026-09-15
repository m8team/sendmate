<script setup lang="ts">
/** The parcel label at the top of a submission: tracking number, barcode, stamp, sender and the actions. */
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import type { Submission } from '../../../lib/api/types';
import { ago, barcode, isoDate, postmark, replyTo, sender, toJson } from '../InboxUtils';
import { replyMailto, stampFor } from './journey';

const props = defineProps<{ s: Submission; formName: string; now: number; released: boolean }>();
const emit = defineEmits<{ star: []; spam: []; release: []; delete: [] }>();

const who = computed(() => sender(props.s));
const email = computed(() => (props.s.status === 'held' ? null : replyTo(props.s)));
const code = computed(() => barcode(props.s.tracking));
const stampInfo = computed(() => stampFor(props.s));
const isHeld = computed(() => props.s.status === 'held');
const isBlocked = computed(() => props.s.status === 'spam' || props.s.status === 'held');
const json = computed(() => toJson(props.s));
const mailto = computed(() => (email.value ? replyMailto(props.s, email.value, who.value, props.formName) : ''));
</script>

<template>
  <header class="plabel">
    <div class="plabel-top">
      <div class="plabel-track">
        <span class="label muted">Tracking no.</span>
        <span class="mono plabel-no">{{ s.tracking }}</span>
      </div>
      <svg class="plabel-bars" :viewBox="`0 0 ${code.width} 20`" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect v-for="(b, i) in code.bars" :key="i" :x="b.x" y="0" :width="b.w" height="20" />
      </svg>
      <span
        :key="`${s.id}-${stampInfo.text}`"
        class="stamp stamp-lg plabel-stamp"
        :class="[stampInfo.cls, { 'is-thunk': released }]"
        style="--stamp-rotate: -6deg"
        >{{ stampInfo.text }}</span
      >
    </div>

    <h2 :id="`det-h-${s.id}`" class="plabel-name" tabindex="-1">{{ who }}</h2>
    <p class="plabel-meta">
      <a v-if="email && email !== who" :href="`mailto:${email}`" class="plabel-email">{{ email }}</a>
      <span v-if="email && email !== who" aria-hidden="true">·</span>
      <span>{{ ago(s.createdAt, now) }}</span>
      <span aria-hidden="true">·</span>
      <time class="mono plabel-time" :datetime="isoDate(s.createdAt)">{{ postmark(s.createdAt) }}</time>
    </p>

    <div class="plabel-actions">
      <a v-if="email" class="btn btn-sm" :class="isBlocked ? 'btn-outline' : 'btn-signal'" :href="mailto"><Icon name="send" :size="16" /> Reply by email</a>
      <button v-else type="button" class="btn btn-outline btn-sm" aria-disabled="true" aria-describedby="no-reply-why" disabled>
        <Icon name="send" :size="16" /> Reply by email
      </button>
      <button type="button" class="btn btn-outline btn-sm act" :aria-pressed="s.starred" @click="emit('star')">
        <Icon name="star" :size="16" class="act-star" /> <span class="act-text">{{ s.starred ? 'Starred' : 'Star' }}</span>
      </button>
      <button v-if="s.status === 'spam'" type="button" class="btn btn-outline btn-sm act" @click="emit('release')">
        <Icon name="check" :size="16" /> <span class="act-text">Not spam</span>
      </button>
      <button v-else-if="!isHeld" type="button" class="btn btn-outline btn-sm act" @click="emit('spam')">
        <Icon name="shield" :size="16" /> <span class="act-text">Spam</span>
      </button>
      <button type="button" class="btn btn-outline btn-sm act copy-btn" :data-copy="json" data-copy-toast="Copied as JSON">
        <span class="copy-idle"><Icon name="code" :size="16" /> <span class="act-text">Copy JSON</span></span>
        <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /> <span class="act-text">Copied</span></span>
      </button>
      <button type="button" class="btn btn-danger btn-sm act" @click="emit('delete')">
        <Icon name="trash" :size="16" /> <span class="act-text">Delete</span>
      </button>
    </div>
    <p v-if="!email" id="no-reply-why" class="plabel-why">
      {{ isHeld ? 'Its contents are hidden while it’s held, so there’s nobody to reply to.' : 'No email field in this one, so there’s nobody to reply to.' }}
    </p>
  </header>
</template>

<style scoped>
.plabel {
  position: relative;
  padding: var(--s-4) var(--s-5) var(--s-5);
  border: var(--bw-strong) solid var(--line-strong);
  background: var(--bg-raised);
  box-shadow: var(--shadow-label);
}
.plabel-top {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  padding-bottom: var(--s-3);
  margin-bottom: var(--s-4);
  border-bottom: 2px dashed var(--line);
  padding-right: 16.5rem;
  min-height: 3rem;
}
.plabel-track {
  display: grid;
  gap: 0.1rem;
}
.plabel-no {
  font-size: var(--fs-md);
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.plabel-bars {
  width: 9rem;
  height: 1.9rem;
  fill: var(--fg);
  flex: none;
}
.plabel-stamp {
  position: absolute;
  top: 1.05rem;
  right: 1.1rem;
  font-size: 1.05rem;
  pointer-events: none;
}
.plabel-stamp.is-thunk {
  animation: det-thunk 460ms var(--ease-thunk) both;
}
@keyframes det-thunk {
  0% {
    transform: scale(2.4) rotate(calc(var(--stamp-rotate) - 14deg));
    opacity: 0;
  }
  55% {
    transform: scale(0.9) rotate(var(--stamp-rotate));
    opacity: 1;
  }
  100% {
    transform: scale(1) rotate(var(--stamp-rotate));
  }
}
@media (prefers-reduced-motion: reduce) {
  .plabel-stamp.is-thunk {
    animation: none;
  }
}
.plabel-name {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(2rem, 4.2cqi, 3.2rem);
  line-height: 0.92;
  letter-spacing: -0.005em;
  overflow-wrap: anywhere;
}
.plabel-name:focus {
  outline: none;
  box-shadow: none;
}
.plabel-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.5rem;
  margin-top: var(--s-2);
  color: var(--fg-muted);
  font-size: var(--fs-sm);
}
.plabel-email {
  color: var(--fg);
  font-weight: 600;
}
.plabel-time {
  font-size: var(--fs-xs);
}
.plabel-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-top: var(--s-4);
}
.act[aria-pressed='true'] {
  --btn-bg: var(--bg-sunk);
}
.act[aria-pressed='true'] .act-star {
  fill: var(--accent);
}
.plabel-why {
  margin-top: var(--s-2);
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}

/* ---- Narrow detail: icon-only secondary actions ------------------------- */
@container det (max-width: 34rem) {
  .plabel {
    padding: var(--s-4);
  }
  .plabel-top {
    padding-right: 0;
    gap: var(--s-2);
  }
  .plabel-track {
    min-width: 0;
  }
  .plabel-no {
    font-size: var(--fs-sm);
    white-space: normal;
  }
  .plabel-bars {
    display: none;
  }
  .plabel-stamp {
    position: static;
    flex: none;
    margin-left: auto;
    font-size: 0.72rem;
    border-width: 3px;
    box-shadow: inset 0 0 0 2px var(--bg), inset 0 0 0 4px var(--stamp-color);
  }
  .act {
    padding-inline: 0.6rem;
  }
  .act .act-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
