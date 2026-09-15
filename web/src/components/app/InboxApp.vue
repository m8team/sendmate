<script setup lang="ts">
/**
 * The inbox for one form: pigeonhole label and banners on top, then the list pane
 * (folders, search, bulk bar, rows) beside the detail pane. On phones the detail is a full-screen sheet.
 * State and behaviour live in the composables under ./inbox; this file wires them to the view.
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Channel, Form } from '../../lib/api/types';
import InboxDetail from './InboxDetail.vue';
import BulkBar from './inbox/BulkBar.vue';
import FolderTabs from './inbox/FolderTabs.vue';
import FormStateBanner from './inbox/FormStateBanner.vue';
import HeldBanner from './inbox/HeldBanner.vue';
import InboxHeader from './inbox/InboxHeader.vue';
import InboxSearch from './inbox/InboxSearch.vue';
import KeyboardHints from './inbox/KeyboardHints.vue';
import SubmissionList from './inbox/SubmissionList.vue';
import UndoToast from './inbox/UndoToast.vue';
import type { Filter } from './inbox/folders';
import { useInboxExport } from './inbox/useInboxExport';
import { useInboxKeyboard } from './inbox/useInboxKeyboard';
import { useInboxNav } from './inbox/useInboxNav';
import { useSubmissionActions } from './inbox/useSubmissionActions';
import { useSubmissions } from './inbox/useSubmissions';
import { useUndoDelete } from './inbox/useUndoDelete';

const props = defineProps<{
  form: Form;
  channels: Channel[];
  digestHourUtc: number;
  spamRetentionDays: number;
  maxDeliveryAttempts: number;
}>();
const emit = defineEmits<{ 'form-updated': [form: Form] }>();

const now = ref(Date.now());
const formStatus = ref<Form['status']>(props.form.status);

const rootEl = ref<HTMLElement | null>(null);
const detailEl = ref<HTMLElement | null>(null);
const searchRef = ref<InstanceType<typeof InboxSearch> | null>(null);
const listRef = ref<InstanceType<typeof SubmissionList> | null>(null);

const list = useSubmissions(props, (form) => emit('form-updated', form));
const { filter, query, appliedQuery, selected, hasHeld, loading, loadingMore, loadError, visible, visibleIds, nextCursor, tabs, openId, activeId, load, probeHeld } = list;

const nav = useInboxNav(list, { list: () => listRef.value?.listEl ?? null, detail: detailEl });
const { mobileOpen, releasedId, current, openIndex, tabStopId, open, closeMobile, flick } = nav;

const actions = useSubmissionActions(list, { formId: () => props.form.id, spamRetentionDays: () => props.spamRetentionDays, releasedId });
const { toggleStar, markSpam, release, retry, retryingId, toggleSelect, toggleAll, selectedInView, allSelected, someSelected, bulkBusy, bulkAllStarred, bulkAllBlocked, bulkRead, bulkStar, bulkSpam } =
  actions;

const { undo, remove, commitDelete, undoDelete } = useUndoDelete(list, nav, () => props.form.id);
const { announceView } = useInboxExport(list, () => props.form);

useInboxKeyboard({ list, nav, toggleStar, toggleSelect, searchEl: () => searchRef.value?.input, listEl: () => listRef.value?.listEl });

function setFilter(f: Filter, focusTab = false) {
  if (filter.value !== f) filter.value = f;
  selected.value = [];
  if (focusTab) nextTick(() => rootEl.value?.querySelector<HTMLElement>(`#tab-${f}`)?.focus());
}
function onRowFocus(id: string) {
  activeId.value = id;
}

let clock = 0;
onMounted(() => {
  clock = window.setInterval(() => (now.value = Date.now()), 30_000);
  load();
  probeHeld();
  announceView();
  rootEl.value?.setAttribute('data-ready', '');
});
onBeforeUnmount(() => window.clearInterval(clock));
</script>

<template>
  <div ref="rootEl" class="inbox" :class="{ 'has-detail-open': mobileOpen }">
    <InboxHeader :form="form" :form-status="formStatus" />

    <FormStateBanner v-model:form-status="formStatus" :form="form" :now="now" @form-updated="emit('form-updated', $event)" />
    <HeldBanner v-if="hasHeld || form.flag" :flag="form.flag" :show-review="filter !== 'held'" @review="setFilter('held')" />

    <div class="split">
      <!-- ============ List pane ============ -->
      <section class="pane-list" aria-label="Submissions">
        <div class="tools">
          <FolderTabs :tabs="tabs" :filter="filter" @select="setFilter" />
          <InboxSearch ref="searchRef" v-model="query" />
          <BulkBar
            :picked-count="selectedInView.length"
            :visible-count="visibleIds.length"
            :all-selected="allSelected"
            :some-selected="someSelected"
            :loading="loading"
            :has-more="!!nextCursor"
            :applied-query="appliedQuery"
            :busy="bulkBusy"
            :all-starred="bulkAllStarred"
            :all-blocked="bulkAllBlocked"
            @toggle-all="toggleAll"
            @read="bulkRead"
            @star="bulkStar"
            @spam="bulkSpam"
            @delete="remove([...selectedInView])"
          />
        </div>

        <SubmissionList
          ref="listRef"
          :filter="filter"
          :applied-query="appliedQuery"
          :endpoint="form.endpoint"
          :loading="loading"
          :loading-more="loadingMore"
          :load-error="loadError"
          :visible="visible"
          :has-more="!!nextCursor"
          :now="now"
          :open-id="openId"
          :selected="selected"
          :tab-stop-id="tabStopId"
          @retry="load()"
          @load-more="load(false)"
          @clear-search="searchRef?.clear()"
          @back-to-inbox="setFilter('inbox', true)"
          @open="open"
          @focus="onRowFocus"
          @pick="toggleSelect"
          @star="toggleStar"
        />

        <UndoToast v-if="undo" :label="undo.label" @undo="undoDelete" @dismiss="commitDelete()" />
        <KeyboardHints />
      </section>

      <!-- ============ Detail pane ============ -->
      <div ref="detailEl" class="pane-detail" :class="{ 'is-open': mobileOpen }" role="region" aria-label="Submission detail">
        <InboxDetail
          v-if="current"
          :key="current.id"
          :s="current"
          :form="form"
          :form-status="formStatus"
          :channels="channels"
          :now="now"
          :released="releasedId === current.id"
          :has-prev="openIndex > 0"
          :has-next="openIndex !== -1 && openIndex < visibleIds.length - 1"
          :digest-hour-utc="digestHourUtc"
          :spam-retention-days="spamRetentionDays"
          :max-delivery-attempts="maxDeliveryAttempts"
          :retrying="retryingId === current.id"
          @retry="retry(current)"
          @back="closeMobile()"
          @prev="flick(-1)"
          @next="flick(1)"
          @star="toggleStar(current)"
          @spam="markSpam(current)"
          @release="release(current)"
          @delete="remove([current.id])"
        />
        <div v-else class="det-empty">
          <p class="det-empty-mark" aria-hidden="true">Nº&nbsp;—</p>
          <p class="empty-title">Pick a letter.</p>
          <p class="empty-body">Choose something from the list to see what’s inside, where it went and how spammy it looked.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inbox {
  --topbar-h: 3.75rem;
  --list-w: 24rem;
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--topbar-h));
  min-height: 34rem;
}

/* ---- Split ------------------------------------------------------------- */
.split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: var(--list-w) minmax(0, 1fr);
  margin-top: var(--s-3);
  border-top: 1px solid var(--line);
}
.pane-list {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: var(--bw-strong) solid var(--line-strong);
  background: var(--bg-sunk);
}
.pane-detail {
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
}
.tools {
  display: grid;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-3) 0;
  background: var(--bg-sunk);
}

/* ---- Nothing open ------------------------------------------------------ */
.det-empty {
  display: grid;
  justify-items: start;
  gap: var(--s-2);
  align-content: center;
  min-height: 100%;
  padding: var(--s-8) clamp(1rem, 4vw, 4rem);
}
.det-empty-mark {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(5rem, 12vw, 10rem);
  line-height: 0.8;
  color: var(--bg-deep);
}
.empty-title {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: 2rem;
  line-height: 0.95;
}
.empty-body {
  max-width: 34ch;
  font-size: var(--fs-sm);
  color: var(--fg-muted);
  margin-bottom: var(--s-2);
}

@media (max-width: 1100px) {
  .inbox {
    --list-w: 20rem;
  }
}

/* ---- Mobile: list is the page, detail is a full-screen sheet --------- */
@media (max-width: 720px) {
  .inbox {
    height: auto;
    min-height: calc(100dvh - var(--topbar-h));
  }
  .split {
    display: block;
    border-top: 0;
  }
  .pane-list {
    border-right: 0;
    min-height: 60dvh;
  }
  .tools {
    position: sticky;
    top: var(--topbar-h);
    z-index: 5;
    padding-top: var(--s-2);
  }
  .pane-detail {
    display: none;
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-overlay) + 2);
    background: var(--bg);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .pane-detail.is-open {
    display: block;
    animation: sheet-in var(--dur-3) var(--ease-out);
  }
  .det-empty {
    display: none;
  }
}
@keyframes sheet-in {
  from {
    transform: translateX(28%);
    opacity: 0;
  }
}
</style>

<style>
html.inbox-detail-open {
  overflow: hidden;
}
</style>
