<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { BlocklistEntryDto } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { dayMonth } from '../InboxUtils';
import { blockTypeLabel, blockTypes, validateBlock, type BlockType } from './adminRules';
import { useAdminAction } from './useAdminAction';

/** 03 Blocklist: block an email, domain or IP, and lift entries (suspended users show here too). */
const blocklist = ref<BlocklistEntryDto[]>([]);
const blocklistLoading = ref(true);
const blocklistError = ref('');
const block = reactive({ type: 'email' as BlockType, value: '', reason: '' });
const blockError = ref('');
const { busy, run } = useAdminAction();

async function load() {
  blocklistLoading.value = true;
  blocklistError.value = '';
  try {
    blocklist.value = await api.blocklist();
  } catch (err) {
    blocklistError.value = friendlyError(err);
  } finally {
    blocklistLoading.value = false;
  }
}

async function addBlock() {
  blockError.value = validateBlock(block.type, block.value);
  if (blockError.value) return document.getElementById('ad-block-value')?.focus();
  const label = block.type === 'ip' ? 'that IP' : block.value.trim();
  if (await run('block:add', () => api.addBlock({ ...block }), `Blocked ${label}.`)) {
    block.value = '';
    block.reason = '';
    load();
  }
}

async function removeBlock(e: BlocklistEntryDto) {
  if (await run(`block:${e.type}:${e.value}`, () => api.removeBlock(e), 'Removed from the blocklist.')) {
    blocklist.value = blocklist.value.filter((x) => !(x.type === e.type && x.value === e.value));
  }
}

onMounted(load);
/** Suspending a user adds them to the list, so the page reloads it. */
defineExpose({ load });
</script>

<template>
  <section class="ad-section" aria-labelledby="ad-block">
    <div class="ad-bar">
      <h2 id="ad-block" class="bay label label-lg"><span class="bay-no">04</span> Blocklist</h2>
    </div>

    <form class="ad-panel ad-blockform" novalidate @submit.prevent="addBlock">
      <div class="field">
        <label class="field-label" for="ad-block-type">Block</label>
        <select id="ad-block-type" v-model="block.type" class="select">
          <option v-for="t in blockTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="ad-block-value">Value</label>
        <input
          id="ad-block-value"
          v-model="block.value"
          class="input mono"
          autocomplete="off"
          spellcheck="false"
          :placeholder="blockTypes.find((t) => t.value === block.type)?.placeholder"
          :aria-invalid="blockError ? 'true' : undefined"
          :aria-describedby="blockError ? 'ad-block-err' : block.type === 'ip' ? 'ad-block-hint' : undefined"
        />
        <p v-if="blockError" id="ad-block-err" class="field-error"><Icon name="alert" :size="14" /> {{ blockError }}</p>
        <p v-else-if="block.type === 'ip'" id="ad-block-hint" class="field-hint">Only its hash is stored, the same way submissions store IPs.</p>
      </div>
      <div class="field">
        <label class="field-label" for="ad-block-reason">Reason <span class="muted">(optional)</span></label>
        <input id="ad-block-reason" v-model="block.reason" class="input" maxlength="200" autocomplete="off" />
      </div>
      <button type="submit" class="btn btn-signal btn-sm" :aria-disabled="busy['block:add'] ? 'true' : undefined"><Icon name="plus" :size="16" /> Add to blocklist</button>
    </form>

    <div v-if="blocklistLoading" class="skel" style="height: 5rem" aria-hidden="true"></div>
    <p v-else-if="blocklistError" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ blocklistError }}</p>
    <p v-else-if="!blocklist.length" class="ad-empty">Nobody’s blocked.</p>
    <div v-else class="table-wrap ad-table">
      <table class="table">
        <caption class="sr-only">Blocklist</caption>
        <thead>
          <tr>
            <th scope="col">Value</th>
            <th scope="col">Type</th>
            <th scope="col">Reason</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in blocklist" :key="`${e.type}:${e.value}`">
            <td class="mono ad-value">{{ e.value }}</td>
            <td><span class="tag tag-plain">{{ blockTypeLabel[e.type] }}</span></td>
            <td>
              {{ e.reason ?? '—' }}<br /><span class="muted small">{{ dayMonth(e.createdAt) }}</span>
            </td>
            <td class="num">
              <button type="button" class="btn btn-ghost btn-xs" :aria-disabled="busy[`block:${e.type}:${e.value}`] ? 'true' : undefined" @click="removeBlock(e)">
                <Icon name="trash" :size="14" /> {{ e.type === 'user' ? 'Unsuspend' : 'Remove' }}<span class="sr-only"> {{ e.value }}</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped src="./admin-section.css"></style>
<style scoped>
.ad-blockform {
  grid-template-columns: 11rem minmax(0, 1fr);
  align-items: start;
}
.ad-blockform > .field:nth-child(3) {
  grid-column: 1 / -1;
}
.ad-blockform > .btn {
  justify-self: start;
}
.small {
  font-size: var(--fs-2xs);
}
@media (max-width: 900px) {
  .ad-blockform {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
