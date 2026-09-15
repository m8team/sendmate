<script setup lang="ts">
/**
 * One pigeonhole in the rack: name and endpoints, the letter slot with its unread count,
 * this month's meter, the 30-day sparkline and when post last came in.
 * Without a `row` it's the loading placeholder, numbered by `skeleton`.
 * The row's outer grid and hover live in RackTable (they apply to this root element).
 */
import Icon from '../../ui/Icon.vue';
import Sparkline from '../Sparkline.vue';
import { ago } from '../InboxUtils';
import { formStatusTag } from '../inbox/formStatus';
import { fmtN, type RackRow } from './rackRows';

defineProps<{ row?: RackRow; skeleton?: number; now: number }>();
</script>

<template>
  <li v-if="!row" class="hole hole-skel" aria-hidden="true">
    <span class="hole-no mono">0{{ skeleton }}</span>
    <div class="hole-id">
      <span class="skel skel-ink" :style="{ width: `${50 + (skeleton ?? 0) * 9}%`, height: '1.3rem' }"></span>
      <span class="skel hole-endpoint" style="height: 2rem"></span>
    </div>
    <span class="skel" style="width: 2.6rem; height: 2.1rem"></span>
    <span class="skel" style="height: 1.6rem"></span>
    <span class="skel hole-spark" style="height: 2.4rem"></span>
    <span class="skel" style="width: 4rem; height: 0.8rem"></span>
  </li>

  <li v-else class="hole" :class="`is-${row.f.status}`">
    <span class="hole-no mono" aria-hidden="true">{{ row.no }}</span>

    <div class="hole-id">
      <h3 class="hole-name">
        <a :href="row.href" class="hole-link">{{ row.f.name }}</a>
      </h3>
      <span class="tag" :class="formStatusTag(row.f.status).cls">{{ formStatusTag(row.f.status).text }}</span>
      <div class="endpoint hole-endpoint">
        <span class="endpoint-url" tabindex="0" :aria-label="`Endpoint ${row.f.endpoint}`">
          <span class="ep-base">{{ row.f.endpointBase }}</span>
          <span class="ep-id">{{ row.f.id }}</span>
        </span>
        <button type="button" class="btn btn-ghost btn-xs copy-btn copy-icon-only" :data-copy="row.f.endpoint" data-copy-toast="Endpoint copied" :aria-label="`Copy endpoint for ${row.f.name}`">
          <span class="copy-idle"><Icon name="copy" :size="16" /></span>
          <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /></span>
        </button>
      </div>
      <div v-if="row.f.emailEndpoint" class="endpoint hole-endpoint">
        <span class="endpoint-url" tabindex="0" :aria-label="`Email endpoint ${row.f.emailEndpoint}`">
          <span class="ep-base">{{ row.f.endpointBase }}</span>
          <span class="ep-id">{{ row.address }}</span>
        </span>
        <button type="button" class="btn btn-ghost btn-xs copy-btn copy-icon-only" :data-copy="row.f.emailEndpoint" data-copy-toast="Endpoint copied" :aria-label="`Copy email endpoint for ${row.f.name}`">
          <span class="copy-idle"><Icon name="copy" :size="16" /></span>
          <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /></span>
        </button>
      </div>
    </div>

    <div class="hole-slot">
      <span class="sr-only">{{ row.unread ? `${row.unreadLabel} unread` : 'No unread' }}</span>
      <span class="slot" aria-hidden="true">
        <span v-for="i in Math.min(row.unread, 5)" :key="i" class="letter" :style="{ '--i': i - 1 }"></span>
      </span>
      <span class="slot-count mono" :class="{ 'is-zero': row.unread === 0 }" aria-hidden="true">
        {{ !row.unreadLabel ? '··' : row.unread === 0 ? 'none' : row.unreadLabel }}
      </span>
    </div>

    <div class="hole-month">
      <p class="month-num tabular">
        <span class="month-count">{{ fmtN(row.f.monthCount) }}</span>
        <span class="month-of mono">/ {{ fmtN(row.f.monthlyLimit) }}</span>
      </p>
      <span
        class="meter month-meter"
        :class="{ 'is-high': row.pct > 80 }"
        :style="{ '--pct': `${Math.max(row.pct, row.f.monthCount > 0 ? 2 : 0)}%` }"
        role="img"
        :aria-label="`${row.pct}% of the monthly limit`"
      ></span>
    </div>

    <div class="hole-spark">
      <Sparkline v-if="row.f.daily.length" :data="row.f.daily" :label="row.spark" />
      <span v-else class="skel" style="display: block; height: 2.4rem" aria-hidden="true"></span>
    </div>

    <p class="hole-last">
      <span class="label hole-last-k">Last in</span>
      <time v-if="row.f.lastReceivedAt" :datetime="new Date(row.f.lastReceivedAt).toISOString()">{{ ago(row.f.lastReceivedAt, now) }}</time>
      <span v-else class="muted">Nothing yet</span>
    </p>

    <span class="hole-go" aria-hidden="true">
      <Icon name="arrow-right" :size="20" />
    </span>

    <div v-if="row.f.status === 'pending_confirmation'" class="hole-note notice notice-warn">
      <span class="notice-icon"><Icon name="mail" :size="18" /></span>
      <p class="notice-title">Check your inbox to confirm</p>
      <p class="notice-body">
        Someone posted to <code>{{ row.address ?? row.f.id }}</code>, so we emailed that address a confirmation link. Click it and this form goes live. Until then submissions are stored
        here but nothing gets delivered.
      </p>
    </div>
    <div v-else-if="row.f.status === 'paused'" class="hole-note notice">
      <span class="notice-icon"><Icon name="pause" :size="18" /></span>
      <p class="notice-title">Paused</p>
      <p class="notice-body">New submissions are turned away (HTTP 423) until you resume it. The ones already here are safe.</p>
    </div>
    <div v-else-if="row.f.status === 'disabled'" class="hole-note notice notice-signal">
      <span class="notice-icon"><Icon name="lock" :size="18" /></span>
      <p class="notice-title">Switched off</p>
      <p class="notice-body">This form isn’t taking submissions{{ row.f.flag ? ` (${row.f.flag})` : '' }}. What’s already here is still yours.</p>
    </div>
  </li>
</template>

<style scoped>
.hole-skel {
  pointer-events: none;
}
.hole-no {
  align-self: start;
  padding-top: 0.2rem;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--fg-muted);
}
.hole-id {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--s-3);
  row-gap: var(--s-2);
  min-width: 0;
}
.hole-name {
  min-width: 0;
  font-family: var(--font-display);
  font-stretch: var(--stretch-semi);
  font-weight: 800;
  font-size: clamp(1.2rem, 1.6vw, 1.45rem);
  line-height: 1.05;
  overflow-wrap: break-word;
}
.hole-link {
  text-decoration: none;
}
.hole-link:hover {
  text-decoration: underline;
  text-decoration-thickness: 2px;
}
/* Stretched link: the whole pigeonhole opens the inbox */
.hole-link::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
}
.hole-link:focus-visible {
  outline: none;
  box-shadow: none;
}
.hole-link:focus-visible::after {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
  box-shadow: inset 0 0 0 5px var(--focus-halo);
}
.hole-endpoint {
  flex-basis: 100%;
  position: relative;
  z-index: 2;
  max-width: 26rem;
  border-width: 1px;
  background: var(--bg-raised);
}
.hole-endpoint .endpoint-url {
  padding: 0.3rem 0.6rem;
  font-size: var(--fs-xs);
}
.hole-endpoint .copy-btn {
  border-left-width: 1px;
  min-height: 2rem;
}

/* The compartment: letters stack up inside it */
.hole-slot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.slot {
  position: relative;
  flex: none;
  width: 2.6rem;
  height: 2.1rem;
  border: 2px solid var(--line-strong);
  border-top-width: 5px;
  background: var(--bg-sunk);
  overflow: hidden;
}
.letter {
  position: absolute;
  left: 3px;
  right: 3px;
  bottom: calc(2px + var(--i) * 4px);
  height: 9px;
  background: var(--bg-raised);
  border: 1px solid var(--line-strong);
  transform: rotate(calc((var(--i) - 2) * 1.6deg));
}
.letter:last-child {
  border-top: 2px solid var(--signal);
}
.slot-count {
  font-size: var(--fs-md);
  font-weight: 600;
}
.slot-count.is-zero {
  font-size: var(--fs-xs);
  font-weight: 400;
  color: var(--fg-muted);
}

.hole-month {
  display: grid;
  gap: 0.35rem;
}
.month-num {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}
.month-count {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 850;
  font-size: 1.75rem;
  line-height: 1;
}
.month-of {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
.month-meter {
  height: 10px;
}
.hole-spark {
  --spark-w: 11rem;
}
.hole-last {
  font-size: var(--fs-sm);
}
.hole-last-k {
  display: none;
}
.hole-go {
  color: var(--fg-muted);
  transition: transform var(--dur-2) var(--ease-out), color var(--dur-2);
}
.hole:hover .hole-go {
  color: var(--signal-text);
  transform: translateX(3px);
}

.hole-note {
  grid-column: 2 / -1;
  margin-top: var(--s-3);
  position: relative;
  z-index: 2;
  padding: 0.7rem 0.9rem;
}
.hole-note code {
  white-space: normal;
  overflow-wrap: anywhere;
}
.is-paused .hole-name,
.is-paused .month-count {
  color: var(--fg-muted);
}

/* ---- Mid widths: drop the sparkline column into the month cell -------- */
@media (max-width: 1240px) {
  .hole-spark {
    grid-column: 4;
    grid-row: 2;
    --spark-w: 9rem;
    margin-top: var(--s-2);
  }
  .hole-note {
    grid-row: 3;
  }
}

/* ---- Phones & small tablets: a designed stack, not a squashed table ---- */
@media (max-width: 760px) {
  .hole > * {
    grid-column: 1 / -1;
    grid-row: auto;
  }
  .hole > .hole-no {
    grid-column: 1;
    grid-row: 1;
    align-self: center;
    padding: 0;
    font-size: var(--fs-xs);
  }
  .hole-no::before {
    content: 'Pigeonhole ';
    font-weight: 400;
  }
  .hole > .hole-slot {
    grid-column: 2;
    grid-row: 1;
    flex-direction: row-reverse;
  }
  .hole-name {
    font-size: 1.6rem;
    font-stretch: var(--stretch-condensed);
    font-weight: 850;
  }
  .hole-endpoint {
    max-width: none;
  }
  .hole > .hole-month {
    grid-column: 1;
    align-self: end;
  }
  .hole > .hole-spark {
    grid-column: 2;
    grid-row: span 1;
    margin: 0;
    align-self: end;
    width: 7.5rem;
  }
  .hole-last {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding-top: var(--s-2);
    border-top: 1px dashed var(--line);
  }
  .hole-last-k {
    display: inline;
    color: var(--fg-muted);
  }
  .hole-go {
    display: none;
  }
  .hole-note {
    margin: 0;
  }
}
</style>
