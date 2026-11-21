<script setup lang="ts">
/**
 * One form in the table: name and endpoint id, unread count, this month's usage, when post last
 * came in, and a copy button. The whole row opens the inbox. Status only shows when it isn't plain active.
 */
import Icon from '../../ui/Icon.vue';
import { ago } from '../InboxUtils';
import { formStatusTag } from '../inbox/formStatus';
import { fmtN, type RackRow } from './rackRows';

defineProps<{ row: RackRow; now: number }>();
</script>

<template>
  <div class="ft-row fr" :class="`is-${row.f.status}`" role="row">
    <div class="fr-id" role="cell">
      <p class="fr-name">
        <a :href="row.href" class="fr-link">{{ row.f.name }}</a>
        <span v-if="row.idHint" class="fr-hint mono">{{ row.idHint }}</span>
        <span v-if="row.f.status !== 'active'" class="tag" :class="formStatusTag(row.f.status).cls">{{ formStatusTag(row.f.status).text }}</span>
      </p>
      <p v-if="row.f.status === 'pending_confirmation'" class="fr-note">Confirm the email we sent to {{ row.address ?? 'the address' }} to start delivering.</p>
      <p v-else-if="row.f.status === 'paused'" class="fr-note">New submissions are rejected until you resume it.</p>
      <p v-else-if="row.f.status === 'disabled'" class="fr-note">Not taking submissions{{ row.f.flag ? ` (${row.f.flag})` : '' }}.</p>
      <p v-else class="fr-endpoint mono">/f/{{ row.address ?? row.f.id }}</p>
    </div>

    <p class="num fr-unread" role="cell">
      <b v-if="row.unread">{{ row.unreadLabel }}</b>
      <span v-else class="muted">{{ row.unreadLabel ? '0' : '·' }}</span><span class="fr-sfx"> unread</span>
    </p>

    <p class="num fr-month" role="cell" :class="{ 'is-high': row.pct > 80 }">
      <span class="tabular">{{ fmtN(row.f.monthCount) }}</span><span class="muted tabular"> / {{ fmtN(row.f.monthlyLimit) }}</span><span class="fr-sfx"> this month</span>
    </p>

    <p class="fr-last" role="cell">
      <time v-if="row.f.lastReceivedAt" :datetime="new Date(row.f.lastReceivedAt).toISOString()">{{ ago(row.f.lastReceivedAt, now) }}</time>
      <span v-else class="muted">None yet</span>
    </p>

    <span class="fr-copy" role="cell">
      <button type="button" class="icon-btn copy-btn" :data-copy="row.f.endpoint" data-copy-toast="Endpoint copied" :aria-label="`Copy endpoint for ${row.f.name}`" title="Copy endpoint">
        <span class="copy-idle"><Icon name="copy" :size="15" /></span>
        <span class="copy-done" aria-hidden="true"><Icon name="check" :size="15" /></span>
      </button>
    </span>
  </div>
</template>

<style scoped>
.fr {
  position: relative;
  min-height: 3.5rem;
  padding-block: var(--s-3) !important;
  border-bottom: 1px solid var(--line);
  transition: background-color var(--dur-1);
}
.fr:last-child {
  border-bottom: 0;
}
.fr:hover {
  background: var(--bg-sunk);
}
.fr-id {
  min-width: 0;
}
.fr-name {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
}
.fr-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  color: var(--fg);
  text-decoration: none;
}
/* Stretched link: the whole row opens the inbox */
.fr-link::after {
  content: '';
  position: absolute;
  inset: 0;
}
.fr-link:focus-visible {
  outline: none;
  box-shadow: none;
}
.fr-link:focus-visible::after {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
.fr-hint {
  flex: none;
  font-size: var(--fs-2xs);
  color: var(--fg-subtle);
}
.fr-endpoint,
.fr-note {
  margin-top: 0.125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-2xs);
  color: var(--fg-muted);
}
.is-pending_confirmation .fr-note {
  color: var(--warn);
}
.num {
  text-align: right;
}
.fr-unread b {
  font-weight: 650;
}
.fr-month.is-high {
  color: var(--signal-text);
}
.fr-last {
  color: var(--fg-muted);
}
.fr-sfx {
  display: none;
}
.fr-copy {
  position: relative;
  z-index: 1;
  justify-self: end;
}
.fr-copy .icon-btn {
  color: var(--fg-muted);
}
.fr-copy .icon-btn:hover {
  color: var(--fg);
}

/* Phones: name and copy on top, then "2 unread · 0 / 1,000 this month · 12 Oct". */
@media (max-width: 760px) {
  .fr {
    grid-template-columns: auto auto minmax(0, 1fr) auto !important;
    column-gap: var(--s-3) !important;
    row-gap: var(--s-1);
  }
  .fr-id {
    grid-column: 1 / 4;
  }
  .fr-copy {
    grid-column: 4;
    grid-row: 1;
  }
  .fr-unread,
  .fr-month,
  .fr-last {
    grid-row: 2;
    text-align: left;
    font-size: var(--fs-2xs);
    color: var(--fg-muted);
    white-space: nowrap;
  }
  .fr-unread b {
    color: var(--fg);
  }
  .fr-sfx {
    display: inline;
  }
}
</style>
