<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import type { AdminReportDto } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { ago, dayMonth } from '../InboxUtils';
import { disableReasonFor, formStatusTag, reasonTag } from './adminRules';
import { useAdminAction } from './useAdminAction';

/** 02 Abuse reports: resolve them, disable the form with a reason, or restore it. */
const now = ref(Date.now());
const reports = ref<AdminReportDto[]>([]);
const reportsLoading = ref(true);
const reportsError = ref('');
const showAll = ref(false);
const { busy, run } = useAdminAction();
/** Report id whose "disable" reason box is open. */
const disabling = ref<string | null>(null);
const disableReason = ref('');
const disableError = ref('');

async function loadReports() {
  reportsLoading.value = true;
  reportsError.value = '';
  try {
    reports.value = await api.adminReports(showAll.value ? 'all' : 'open');
  } catch (err) {
    reportsError.value = friendlyError(err);
  } finally {
    reportsLoading.value = false;
  }
}

async function resolve(r: AdminReportDto) {
  if (await run(`resolve:${r.id}`, () => api.resolveReport(r.id), 'Report resolved.')) loadReports();
}
async function openDisable(r: AdminReportDto) {
  disabling.value = r.id;
  disableReason.value = disableReasonFor(r);
  disableError.value = '';
  await nextTick();
  document.getElementById(`ad-reason-${r.id}`)?.focus();
}
async function confirmDisable(r: AdminReportDto) {
  if (!r.form) return;
  const reason = disableReason.value.trim();
  if (!reason) {
    disableError.value = 'Say why. The owner sees this reason on their form.';
    return document.getElementById(`ad-reason-${r.id}`)?.focus();
  }
  if (await run(`disable:${r.id}`, () => api.disableForm(r.form!.id, reason), `Disabled “${r.form.name}”.`)) {
    disabling.value = null;
    loadReports();
  }
}
async function restore(r: AdminReportDto) {
  if (!r.form) return;
  if (await run(`restore:${r.id}`, () => api.restoreForm(r.form!.id), `Restored “${r.form.name}”. Held submissions went back to its inbox and its reports were resolved.`)) loadReports();
}

onMounted(loadReports);
</script>

<template>
  <section class="ad-section" aria-labelledby="ad-reports">
    <div class="ad-bar">
      <h2 id="ad-reports" class="bay label label-lg"><span class="bay-no">02</span> {{ showAll ? 'All reports' : 'Open reports' }}</h2>
      <label class="ad-toggle">
        <input v-model="showAll" type="checkbox" class="switch" @change="loadReports" />
        <span>Include resolved</span>
      </label>
    </div>

    <div v-if="reportsLoading" class="skel" style="height: 6rem" aria-hidden="true"></div>
    <p v-else-if="reportsError" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ reportsError }}</p>
    <p v-else-if="!reports.length" class="ad-empty">{{ showAll ? 'No reports, ever. Lovely.' : 'No open reports. Nothing to see here.' }}</p>
    <ul v-else role="list" class="ad-reports">
      <li v-for="r in reports" :key="r.id" class="ad-report" :class="{ resolved: r.resolvedAt }">
        <div class="ad-report-main">
          <p class="ad-report-top">
            <span class="tag" :class="reasonTag[r.reason]">{{ r.reason }}</span>
            <span v-if="r.resolvedAt" class="tag tag-ok">Resolved {{ dayMonth(r.resolvedAt) }}</span>
            <span class="mono muted ad-when">{{ ago(r.createdAt, now) }}</span>
          </p>
          <p v-if="r.form" class="ad-form">
            <b>{{ r.form.name }}</b> <span class="mono">{{ r.form.id }}</span>
            <span class="tag" :class="formStatusTag[r.form.status]">{{ r.form.status.replace('_', ' ') }}</span>
            <span v-if="r.form.ownerEmail" class="muted">owner {{ r.form.ownerEmail }}</span>
          </p>
          <p v-else class="ad-form muted">The form has been deleted.</p>
          <p v-if="r.form?.flaggedReason" class="ad-flag"><Icon name="flag" :size="14" /> Flagged: {{ r.form.flaggedReason }}</p>
          <p v-if="r.details" class="ad-details">“{{ r.details }}”</p>
          <p v-if="r.reporterEmail" class="ad-reporter muted">Reported by {{ r.reporterEmail }}</p>
        </div>

        <div class="ad-actions">
          <template v-if="disabling === r.id && r.form">
            <form class="ad-reason" novalidate @submit.prevent="confirmDisable(r)">
              <label class="field-label" :for="`ad-reason-${r.id}`">Why disable “{{ r.form.name }}”?</label>
              <input
                :id="`ad-reason-${r.id}`"
                v-model="disableReason"
                class="input"
                maxlength="200"
                placeholder="phishing: collects bank logins"
                :aria-invalid="disableError ? 'true' : undefined"
                :aria-describedby="disableError ? `ad-reason-err-${r.id}` : undefined"
              />
              <p v-if="disableError" :id="`ad-reason-err-${r.id}`" class="field-error"><Icon name="alert" :size="14" /> {{ disableError }}</p>
              <div class="cluster">
                <button type="button" class="btn btn-ghost btn-sm" @click="disabling = null">Cancel</button>
                <button type="submit" class="btn btn-danger btn-sm" :aria-disabled="busy[`disable:${r.id}`] ? 'true' : undefined">Disable form</button>
              </div>
            </form>
          </template>
          <template v-else>
            <button v-if="!r.resolvedAt" type="button" class="btn btn-outline btn-sm" :aria-disabled="busy[`resolve:${r.id}`] ? 'true' : undefined" @click="resolve(r)">
              <Icon name="check" :size="16" /> Resolve
            </button>
            <button v-if="r.form && r.form.status !== 'disabled'" type="button" class="btn btn-danger btn-sm" @click="openDisable(r)">
              <Icon name="lock" :size="16" /> Disable form
            </button>
            <button
              v-if="r.form && (r.form.status === 'disabled' || r.form.flaggedReason)"
              type="button"
              class="btn btn-outline btn-sm"
              :aria-disabled="busy[`restore:${r.id}`] ? 'true' : undefined"
              @click="restore(r)"
            >
              <Icon name="refresh" :size="16" /> Restore
            </button>
          </template>
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
.ad-reports {
  display: grid;
  border-top: var(--bw-heavy) solid var(--line-strong);
}
.ad-report {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--s-3) var(--s-5);
  padding: var(--s-4) 0;
  border-bottom: 1px solid var(--line);
}
.ad-report.resolved .ad-report-main {
  opacity: 0.7;
}
.ad-report-main {
  display: grid;
  gap: 0.35rem;
  min-width: 0;
}
.ad-report-top,
.ad-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-sm);
}
.ad-when {
  font-size: var(--fs-2xs);
}
.ad-form .mono {
  font-size: var(--fs-xs);
}
.ad-flag {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: var(--fs-sm);
  color: var(--signal-text);
}
.ad-details {
  max-width: 70ch;
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.ad-reporter {
  font-size: var(--fs-xs);
}
.ad-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: flex-end;
  gap: var(--s-2);
}
.ad-reason {
  display: grid;
  gap: var(--s-2);
  width: min(22rem, 100%);
}
@media (max-width: 900px) {
  .ad-report {
    grid-template-columns: minmax(0, 1fr);
  }
  .ad-actions {
    justify-content: flex-start;
  }
}
</style>
