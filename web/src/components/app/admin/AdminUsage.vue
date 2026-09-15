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
  <section class="ad-section" aria-labelledby="ad-usage">
    <div class="ad-bar">
      <h2 id="ad-usage" class="bay label label-lg"><span class="bay-no">01</span> Usage today</h2>
      <button type="button" class="btn btn-ghost btn-xs" @click="loadUsage"><Icon name="refresh" :size="14" /> Refresh</button>
    </div>
    <p v-if="usageError" class="field-error" role="alert"><Icon name="alert" :size="14" /> {{ usageError }}</p>
    <div v-else-if="!usage" class="ad-grid" aria-hidden="true">
      <span v-for="n in 5" :key="n" class="skel" style="height: 7rem"></span>
    </div>
    <template v-else>
      <div class="ad-tiles">
        <div v-for="t in tiles" :key="t.key" class="ad-tile">
          <p class="label ad-tile-label">{{ t.label }}</p>
          <p class="ad-num tabular">
            {{ t.value }}<span v-if="t.of" class="ad-of">{{ t.of }}</span>
          </p>
          <span
            v-if="t.pct !== null"
            class="meter"
            :class="{ 'is-high': t.pct >= 70 }"
            :style="{ '--pct': `${meterPct(t.pct)}%` }"
            role="img"
            :aria-label="`${t.pct}% used`"
          ></span>
          <p class="ad-note">{{ t.note }}</p>
        </div>
      </div>

      <div class="table-wrap ad-table">
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
              <td class="mono ad-value">{{ f.formId }}</td>
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
.ad-grid,
.ad-tiles {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0;
}
.ad-grid {
  gap: var(--s-3);
}
.ad-tiles {
  border: var(--bw-strong) solid var(--line-strong);
  background: var(--bg-raised);
}
.ad-tile {
  display: grid;
  align-content: start;
  gap: 0.4rem;
  padding: var(--s-4);
  min-width: 0;
}
.ad-tile + .ad-tile {
  border-left: 1px dashed var(--line);
}
.ad-tile-label {
  color: var(--fg-muted);
}
.ad-num {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(2.2rem, 3.2vw, 3rem);
  line-height: 0.9;
  overflow-wrap: anywhere;
}
.ad-of {
  margin-left: 0.1em;
  font-size: 0.45em;
  font-weight: 700;
  color: var(--fg-muted);
}
.ad-tile .meter {
  height: 10px;
}
.ad-note {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
@media (max-width: 1100px) {
  .ad-tiles,
  .ad-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .ad-tile:nth-child(3n + 1) {
    border-left: 0;
  }
  .ad-tile:nth-child(n + 4) {
    border-top: 1px dashed var(--line);
  }
}
@media (max-width: 900px) {
  .ad-tiles,
  .ad-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ad-tile:nth-child(3n + 1) {
    border-left: 1px dashed var(--line);
  }
  .ad-tile:nth-child(odd) {
    border-left: 0;
  }
  .ad-tile:nth-child(n + 3) {
    border-top: 1px dashed var(--line);
  }
}
</style>
