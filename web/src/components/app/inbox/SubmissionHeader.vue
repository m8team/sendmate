<script setup lang="ts">
/** The top of an open submission: who sent it, when, where it ended up, and what you can do with it. */
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import type { Submission } from '../../../lib/api/types';
import { DAY, ago, fullTime, isoDate, replyTo, sender, toJson } from '../InboxUtils';
import { deliveryStatus, replyMailto } from './journey';

const props = defineProps<{ s: Submission; formName: string; now: number }>();
const emit = defineEmits<{ star: []; spam: []; release: []; delete: [] }>();

const who = computed(() => sender(props.s));
const email = computed(() => (props.s.status === 'held' ? null : replyTo(props.s)));
const status = computed(() => deliveryStatus(props.s));
const isHeld = computed(() => props.s.status === 'held');
const isBlocked = computed(() => props.s.status === 'spam' || props.s.status === 'held');
const json = computed(() => toJson(props.s));
/** "3 h ago" helps for recent post; past a month it would just repeat the date. */
const recent = computed(() => props.now - props.s.createdAt < 30 * DAY);
const mailto = computed(() => (email.value ? replyMailto(props.s, email.value, who.value, props.formName) : ''));
</script>

<template>
  <header class="sh">
    <div class="sh-top">
      <h2 :id="`det-h-${s.id}`" class="sh-name" tabindex="-1">{{ who }}</h2>
      <span class="tag" :class="status.cls">{{ status.text }}</span>
    </div>
    <p class="sh-meta">
      <a v-if="email && email !== who" :href="`mailto:${email}`" class="sh-email">{{ email }}</a>
      <span v-if="email && email !== who" aria-hidden="true">·</span>
      <time :datetime="isoDate(s.createdAt)" :title="fullTime(s.createdAt)">{{ fullTime(s.createdAt) }}</time>
      <span v-if="recent" class="sh-ago">({{ ago(s.createdAt, now) }})</span>
    </p>

    <div class="sh-actions">
      <a v-if="email" class="btn btn-sm" :class="isBlocked ? 'btn-outline' : 'btn-signal'" :href="mailto"><Icon name="send" :size="14" /> Reply</a>
      <button v-else type="button" class="btn btn-outline btn-sm" aria-disabled="true" aria-describedby="no-reply-why" disabled><Icon name="send" :size="14" /> Reply</button>
      <button type="button" class="btn btn-outline btn-sm act" :aria-pressed="s.starred" @click="emit('star')">
        <Icon name="star" :size="14" class="act-star" /> {{ s.starred ? 'Starred' : 'Star' }}
      </button>
      <button v-if="s.status === 'spam'" type="button" class="btn btn-outline btn-sm" @click="emit('release')"><Icon name="check" :size="14" /> Not spam</button>
      <button v-else-if="!isHeld" type="button" class="btn btn-outline btn-sm" @click="emit('spam')">
        <Icon name="shield" :size="14" /> <span class="sh-long">Mark as spam</span><span class="sh-short">Spam</span>
      </button>

      <span class="sh-spacer"></span>
      <button type="button" class="btn btn-ghost btn-sm copy-btn" :data-copy="json" data-copy-toast="Copied as JSON" title="Copy as JSON">
        <span class="copy-idle"><Icon name="code" :size="14" /> <span class="sh-act-text">Copy JSON</span></span>
        <span class="copy-done" aria-hidden="true"><Icon name="check" :size="14" /> <span class="sh-act-text">Copied</span></span>
      </button>
      <button type="button" class="btn btn-ghost btn-sm sh-delete" title="Delete" @click="emit('delete')">
        <Icon name="trash" :size="14" /> <span class="sh-act-text">Delete</span>
      </button>
    </div>
    <p v-if="!email" id="no-reply-why" class="sh-why">
      {{ isHeld ? 'Its contents are hidden while it’s held, so there’s nobody to reply to.' : 'This submission has no email field, so there’s nobody to reply to.' }}
    </p>
  </header>
</template>

<style scoped>
.sh {
  display: grid;
  gap: var(--s-1);
}
.sh-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}
.sh-name {
  min-width: 0;
  font-size: 1.25rem;
  font-weight: 650;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.sh-name:focus,
.sh-name:focus-visible {
  outline: none;
  box-shadow: none;
}
.sh-short {
  display: none;
}
.sh-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 0.4rem;
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}
.sh-email {
  color: var(--fg);
}
.sh-ago {
  color: var(--fg-subtle);
}
.sh-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-3);
}
.sh-spacer {
  flex: 1;
}
.act[aria-pressed='true'] .act-star {
  fill: var(--accent);
  stroke: color-mix(in srgb, var(--accent) 60%, var(--fg));
}
.sh-delete:hover {
  --btn-fg: var(--signal-text);
  --btn-bg: var(--signal-wash);
}
.sh-why {
  margin-top: var(--s-1);
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
/* Narrow detail pane: the secondary actions drop to icons. */
@container det (max-width: 30rem) {
  .sh-spacer {
    display: none;
  }
  .sh-long {
    display: none;
  }
  .sh-short {
    display: inline;
  }
  .sh-act-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
