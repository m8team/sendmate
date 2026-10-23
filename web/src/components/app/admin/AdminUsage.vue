<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { AdminUsageDto } from '@sendm8/shared';
import Icon from '../../ui/Icon.vue';
import { api } from '../../../lib/api/endpoints';
import { friendlyError } from '../../../lib/api/errors';
import { meterPct, usageTiles } from './adminRules';

/** 01 Usage today: headroom against the free tiers, and the busiest forms. */
const usage = ref<AdminUsageDto | null>(null);
const usageError = ref('');

async function loadUsage() {
  usageError.value = '';
  try {
    usage.value = await api.adminUsage();
  } catch (err) {
    usageError.value = friendlyError(err);
  }
}

const tiles = computed(() => (usage.value ? usageTiles(usage.value) : []));

onMounted(loadUsage);
</script>

<template>
  <section class="office-section" aria-labelledby="office-usage">
    <div class="office-bar">
      <h2 id="office-usage" class="bay label label-lg"><span class="bay-no">01</span> Usage today</h2>
      <button type="button" class="btn btn-ghost btn-xs" @click="loadUsage"><Icon name="refresh" :size="14" /> Refresh</button>
    </div>
    <p v-if="usageError" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ usageError }}</p>
    <div v-else-if="!usage" class="office-grid" aria-hidden="true">
      <span v-for="n in 5" :key="n" class="skel" style="height: 7rem"></span>
    </div>
    <template v-else>
      <div class="office-tiles">
        <div v-for="t in tiles" :key="t.key" class="office-tile">
          <p class="label office-tile-label">{{ t.label }}</p>
          <p class="office-num tabular">
            {{ t.value }}<span v-if="t.of" class="office-of">{{ t.of }}</span>
          </p>
          <span
            v-if="t.pct !== null"
            class="meter"
            :class="{ 'is-high': t.pct >= 70 }"
            :style="{ '--pct': `${meterPct(t.pct)}%` }"
            role="img"
            :aria-label="`${t.pct}% used`"
          ></span>
          <p class="office-note">{{ t.note }}</p>
        </div>
      </div>

      <div class="table-wrap office-table">
        <table class="table">
          <caption class="label">Busiest forms today</caption>
          <thead>
            <tr>
              <th scope="col">Form id</th>
              <th scope="col" class="num">Submissions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in usage.topForms" :key="f.formId">
              <td class="mono office-value">{{ f.formId }}</td>
              <td class="num tabular">{{ f.submissions.toLocaleString('en-GB') }}</td>
            </tr>
            <tr v-if="!usage.topForms.length">
              <td colspan="2" class="muted">No submissions yet today.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped src="./admin-section.css"></style>
<style scoped>
.office-grid,
.office-tiles {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0;
}
.office-grid {
  gap: var(--s-3);
}
.office-tiles {
  border: var(--bw-strong) solid var(--line-strong);
  background: var(--bg-raised);
}
.office-tile {
  display: grid;
  align-content: start;
  gap: 0.4rem;
  padding: var(--s-4);
  min-width: 0;
}
.office-tile + .office-tile {
  border-left: 1px dashed var(--line);
}
.office-tile-label {
  color: var(--fg-muted);
}
.office-num {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(2.2rem, 3.2vw, 3rem);
  line-height: 0.9;
  overflow-wrap: anywhere;
}
.office-of {
  margin-left: 0.1em;
  font-size: 0.45em;
  font-weight: 700;
  color: var(--fg-muted);
}
.office-tile .meter {
  height: 10px;
}
.office-note {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
@media (max-width: 1100px) {
  .office-tiles,
  .office-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .office-tile:nth-child(3n + 1) {
    border-left: 0;
  }
  .office-tile:nth-child(n + 4) {
    border-top: 1px dashed var(--line);
  }
}
@media (max-width: 900px) {
  .office-tiles,
  .office-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .office-tile:nth-child(3n + 1) {
    border-left: 1px dashed var(--line);
  }
  .office-tile:nth-child(odd) {
    border-left: 0;
  }
  .office-tile:nth-child(n + 3) {
    border-top: 1px dashed var(--line);
  }
}
</style>
