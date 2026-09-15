<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { toForm } from '../../../lib/api/adapters';
import { friendlyError } from '../../../lib/api/errors';
import { announceFormsChanged, forgetForm } from '../../../lib/api/index';
import { download, exportAll, exportFilename } from '../../../lib/api/export';
import { toast } from '../../../lib/toast';
import { pauseDescription, statusLocked as isLocked, statusTag, submissionsLabel } from './settingsHelpers';
import { useFormSettings } from './useFormSettings';

const { current, status, savedName, chans, deleted, onFormUpdated } = useFormSettings();

const statusBusy = ref(false);
const statusLocked = computed(() => isLocked(status.value));
const tag = computed(() => statusTag(status.value));

async function togglePause() {
  if (statusBusy.value || statusLocked.value) return;
  const next = status.value === 'paused' ? 'active' : 'paused';
  statusBusy.value = true;
  try {
    const dto = await api.updateForm(current.value.id, { status: next });
    const fresh = toForm(dto, current.value.daily);
    current.value = { ...current.value, status: fresh.status };
    onFormUpdated({ ...fresh, name: current.value.name });
    announceFormsChanged();
    toast(next === 'active' ? 'Form resumed. Open for post.' : 'Form paused. New submissions get turned away and nothing is stored.');
  } catch (err) {
    toast(`Couldn’t ${next === 'active' ? 'resume' : 'pause'} it: ${friendlyError(err)}`);
  } finally {
    statusBusy.value = false;
  }
}

const exporting = ref<'csv' | 'json' | null>(null);
async function exportAs(kind: 'csv' | 'json') {
  if (exporting.value) return;
  exporting.value = kind;
  toast(`Packing every submission as ${kind.toUpperCase()}. Your download starts when it’s ready.`);
  try {
    const result = await exportAll(current.value.id, kind, 'all');
    download(exportFilename(current.value.name, 'all', kind), result.content, result.mime);
    toast(result.rows === null ? `Exported as ${kind.toUpperCase()}` : `Exported ${result.rows.toLocaleString('en-GB')} submissions as ${kind.toUpperCase()}`);
  } catch (err) {
    toast(`Export failed: ${friendlyError(err)}`);
  } finally {
    exporting.value = null;
  }
}

const totalLabel = computed(() => submissionsLabel(current.value.counts?.total));
const confirmName = ref('');
const deleting = ref(false);
const deleteError = ref('');
const canDelete = computed(() => confirmName.value.trim() === savedName.value);

async function deleteForm() {
  if (!canDelete.value || deleting.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await api.deleteForm(current.value.id);
    forgetForm(current.value.id);
    announceFormsChanged();
    deleted.value = true;
    window.setTimeout(() => (window.location.href = '/app'), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 1800);
  } catch (err) {
    deleteError.value = friendlyError(err);
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <section id="fs-panel-danger" role="tabpanel" aria-labelledby="fs-tab-danger" tabindex="0" class="panel panel-danger">
    <header class="panel-head">
      <h2 class="h3">Danger zone</h2>
      <p class="muted">The big buttons. Take a breath first.</p>
    </header>

    <div class="row">
      <div class="row-text">
        <p class="row-title">
          {{ status === 'paused' ? 'Resume form' : 'Pause form' }}
          <span :class="tag.cls">
            {{ tag.text }}
          </span>
        </p>
        <p class="row-desc">
          {{ pauseDescription(status) }}
        </p>
      </div>
      <div class="row-control row-control-end">
        <button type="button" class="btn btn-outline" :disabled="statusLocked" :aria-disabled="statusBusy ? 'true' : undefined" @click="togglePause">
          <Icon :name="status === 'paused' ? 'play' : 'pause'" /> {{ statusBusy ? 'Working…' : status === 'paused' ? 'Resume form' : 'Pause form' }}
        </button>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Export everything</p>
        <p class="row-desc">
          {{ totalLabel ? `All ${totalLabel}, spam and held included.` : 'Every submission, spam and held included.' }} Your data, no strings.
        </p>
      </div>
      <div class="row-control row-control-end cluster">
        <button type="button" class="btn btn-outline" :aria-disabled="exporting ? 'true' : undefined" @click="exportAs('csv')">
          <Icon :name="exporting === 'csv' ? 'clock' : 'download'" /> CSV
        </button>
        <button type="button" class="btn btn-outline" :aria-disabled="exporting ? 'true' : undefined" @click="exportAs('json')">
          <Icon :name="exporting === 'json' ? 'clock' : 'download'" /> JSON
        </button>
      </div>
    </div>

    <div class="row row-delete">
      <div class="row-text">
        <p class="row-title">Delete this form</p>
        <p class="row-desc">
          Deletes the form, {{ totalLabel ? `its ${totalLabel}` : 'all its submissions' }} and {{ chans.length }} {{ chans.length === 1 ? 'channel' : 'channels' }}. The endpoint stops working straight away. There’s no
          undo, so export first if you might want it.
        </p>
      </div>
      <div class="row-control">
        <div v-if="deleted" class="deleted" role="status">
          <span class="stamp stamp-lg deleted-stamp" style="--stamp-rotate: -6deg">Return to sender</span>
          <p>Deleted. Taking you back to your forms…</p>
        </div>
        <form v-else class="field" novalidate @submit.prevent="deleteForm">
          <label class="field-label del-label" for="fs-confirm">Type <span class="del-name">{{ savedName }}</span> to confirm</label>
          <input id="fs-confirm" v-model="confirmName" class="input" autocomplete="off" spellcheck="false" aria-describedby="fs-confirm-hint" />
          <p id="fs-confirm-hint" class="field-hint">{{ canDelete ? 'Name matches. Last chance.' : 'It has to match exactly, capitals and all.' }}</p>
          <p v-if="deleteError" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ deleteError }}</p>
          <button type="submit" class="btn btn-danger del-btn" :disabled="!canDelete" :aria-disabled="deleting ? 'true' : undefined">
            <Icon name="trash" /> {{ deleting ? 'Deleting…' : 'Delete form forever' }}
          </button>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped src="./settings-panel.css"></style>
<style scoped>
.row-delete {
  background: var(--signal-wash);
}
.del-label {
  text-transform: none;
  letter-spacing: 0;
  font-family: var(--font-text);
  font-size: var(--fs-sm);
}
.del-name {
  font-family: var(--font-mono);
  padding: 0.05em 0.35em;
  background: var(--bg);
  border: 1px solid var(--line-strong);
}
.del-btn {
  justify-self: start;
  margin-top: var(--s-2);
}
.deleted {
  display: grid;
  gap: var(--s-4);
  justify-items: start;
  padding: var(--s-3) 0;
}
.deleted-stamp {
  --stamp-color: var(--signal-mark);
  animation: fs-thunk 420ms var(--ease-thunk) both;
}
@keyframes fs-thunk {
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
@media (max-width: 560px) {
  .del-btn {
    justify-self: stretch;
  }
}
</style>
