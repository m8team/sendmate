<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { ErrorGroupDto } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { ago } from '../InboxUtils';
import { errorContext, errorSourceLabel, occurrences } from './adminRules';
import { useAdminAction } from './useAdminAction';

/**
 * 03 Errors: crashes from the Worker and from browsers, grouped by fingerprint like Sentry issues.
 * New and returning errors also post to ALERT_WEBHOOK_URL. Resolving one means you hear about it again if it comes back.
 */
const now = ref(Date.now());
const groups = ref<ErrorGroupDto[]>([]);
const loading = ref(true);
const loadError = ref('');
const showResolved = ref(false);
const { busy, run } = useAdminAction();

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    groups.value = await api.adminErrors(showResolved.value ? 'resolved' : 'open');
    now.value = Date.now();
  } catch (err) {
    loadError.value = friendlyError(err);
  } finally {
    loading.value = false;
  }
}

async function resolve(g: ErrorGroupDto) {
  if (await run(`resolve:${g.id}`, () => api.resolveError(g.id), 'Resolved. If it happens again, it reopens and you’ll get an alert.')) load();
}
async function reopen(g: ErrorGroupDto) {
  if (await run(`reopen:${g.id}`, () => api.reopenError(g.id), 'Reopened.')) load();
}

onMounted(load);
</script>

<template>
  <section class="ad-section" aria-labelledby="ad-errors">
    <div class="ad-bar">
      <h2 id="ad-errors" class="bay label label-lg"><span class="bay-no">03</span> {{ showResolved ? 'Resolved errors' : 'Open errors' }}</h2>
      <div class="cluster">
        <label class="ad-toggle">
          <input v-model="showResolved" type="checkbox" class="switch" @change="load" />
          <span>Show resolved</span>
        </label>
        <button type="button" class="btn btn-ghost btn-xs" @click="load"><Icon name="refresh" :size="14" /> Refresh</button>
      </div>
    </div>

    <div v-if="loading" class="skel" style="height: 6rem" aria-hidden="true"></div>
    <p v-else-if="loadError" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ loadError }}</p>
    <p v-else-if="!groups.length" class="ad-empty">{{ showResolved ? 'Nothing resolved recently.' : 'No open errors. Running clean.' }}</p>
    <ul v-else role="list" class="ad-errors">
      <li v-for="g in groups" :key="g.id" class="ad-error" :class="{ resolved: g.resolvedAt }">
        <div class="ad-error-main">
          <p class="ad-error-top">
            <span class="tag" :class="g.source === 'worker' ? 'tag-signal' : 'tag-warn'">{{ errorSourceLabel[g.source] }}</span>
            <b class="ad-count">{{ occurrences(g.count) }}</b>
            <span class="mono muted ad-when">last {{ ago(g.lastSeenAt, now) }} · first {{ ago(g.firstSeenAt, now) }}</span>
          </p>
          <p class="ad-error-title">
            <span class="mono ad-error-name">{{ g.name }}</span> {{ g.message }}
          </p>
          <dl v-if="errorContext(g.context).length" class="ad-context">
            <div v-for="[key, value] in errorContext(g.context)" :key="key">
              <dt class="label">{{ key }}</dt>
              <dd class="mono">{{ value }}</dd>
            </div>
          </dl>
          <details v-if="g.stack" class="ad-stack">
            <summary>Stack trace</summary>
            <pre class="mono">{{ g.stack }}</pre>
          </details>
        </div>

        <div class="ad-actions">
          <button v-if="!g.resolvedAt" type="button" class="btn btn-outline btn-sm" :aria-disabled="busy[`resolve:${g.id}`] ? 'true' : undefined" @click="resolve(g)">
            <Icon name="check" :size="16" /> Resolve
          </button>
          <button v-else type="button" class="btn btn-outline btn-sm" :aria-disabled="busy[`reopen:${g.id}`] ? 'true' : undefined" @click="reopen(g)">
            <Icon name="refresh" :size="16" /> Reopen
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped src="./admin-section.css"></style>
<style scoped>
.ad-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
}
.ad-errors {
  display: grid;
  border-top: var(--bw-heavy) solid var(--line-strong);
}
.ad-error {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-3) var(--s-5);
  padding: var(--s-4) 0;
  border-bottom: 1px solid var(--line);
}
.ad-error.resolved .ad-error-main {
  opacity: 0.7;
}
.ad-error-main {
  display: grid;
  gap: 0.45rem;
  min-width: 0;
}
.ad-error-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-sm);
}
.ad-count {
  font-variant-numeric: tabular-nums;
}
.ad-when {
  font-size: var(--fs-2xs);
}
.ad-error-title {
  max-width: 80ch;
  overflow-wrap: anywhere;
}
.ad-error-name {
  font-weight: 700;
  color: var(--signal-text);
}
.ad-context {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1) var(--s-4);
  font-size: var(--fs-xs);
}
.ad-context div {
  display: flex;
  gap: 0.4rem;
  min-width: 0;
}
.ad-context dt {
  color: var(--fg-muted);
}
.ad-context dd {
  overflow-wrap: anywhere;
}
.ad-stack summary {
  width: fit-content;
  font-size: var(--fs-xs);
  font-weight: 600;
  cursor: pointer;
}
.ad-stack pre {
  margin-top: var(--s-2);
  padding: var(--s-3);
  max-height: 18rem;
  overflow: auto;
  border: 1px solid var(--line);
  background: var(--bg-raised);
  font-size: var(--fs-2xs);
  line-height: 1.5;
  white-space: pre;
}
.ad-actions {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}
@media (max-width: 900px) {
  .ad-error {
    grid-template-columns: minmax(0, 1fr);
  }
  .ad-actions {
    justify-content: flex-start;
  }
}
</style>
