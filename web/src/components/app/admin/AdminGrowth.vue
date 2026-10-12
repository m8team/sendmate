<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { AdminGrowthDto } from "@sendm8/shared";
import Icon from "../../ui/Icon.vue";
import { api } from "../../../lib/api/endpoints";
import { friendlyError } from "../../../lib/api/errors";
import { sourceShares } from "../../../lib/heardFrom";

/**
 * 02 Growth: who's signing up, how they found sendm8, and whether their forms get real traffic.
 * "Live" means a submission from a public website, from someone other than the form's owner.
 */
const growth = ref<AdminGrowthDto | null>(null);
const loadError = ref("");

async function load() {
  loadError.value = "";
  try {
    growth.value = await api.adminGrowth();
  } catch (err) {
    loadError.value = friendlyError(err);
  }
}

const n = (value: number) => value.toLocaleString("en-GB");
const tiles = computed(() => {
  const g = growth.value;
  if (!g) return [];
  return [
    {
      key: "users",
      label: "Accounts",
      value: n(g.users),
      note: `+${n(g.usersLast7d)} this week`,
    },
    {
      key: "forms",
      label: "Forms",
      value: n(g.forms),
      note: `+${n(g.formsLast7d)} this week`,
    },
    {
      key: "live",
      label: "Live forms",
      value: n(g.liveForms30d),
      note: `${n(g.liveForms7d)} live this week · last 30 days`,
    },
  ];
});
const shares = computed(() =>
  growth.value ? sourceShares(growth.value.sources) : [],
);
const skipped = computed(
  () => growth.value?.sources.find((s) => s.source === "skipped")?.count ?? 0,
);

onMounted(load);
</script>

<template>
  <section class="ad-section" aria-labelledby="ad-growth">
    <div class="ad-bar">
      <h2 id="ad-growth" class="bay label label-lg">
        <span class="bay-no">02</span> Growth
      </h2>
      <button type="button" class="btn btn-ghost btn-xs" @click="load">
        <Icon name="refresh" :size="14" /> Refresh
      </button>
    </div>

    <p v-if="loadError" class="field-error" role="alert">
      <Icon name="alert" :size="14" /> {{ loadError }}
    </p>
    <div
      v-else-if="!growth"
      class="skel"
      style="height: 7rem"
      aria-hidden="true"
    ></div>
    <template v-else>
      <div class="gr-tiles">
        <div v-for="t in tiles" :key="t.key" class="gr-tile">
          <p class="label gr-label">{{ t.label }}</p>
          <p class="gr-num tabular">{{ t.value }}</p>
          <p class="gr-note">{{ t.note }}</p>
        </div>
      </div>

      <div class="gr-two">
        <div>
          <h3 class="label gr-sub">How people found sendm8</h3>
          <p v-if="!shares.length" class="ad-empty">
            No answers yet. New accounts are asked once, on their forms page.
          </p>
          <ul v-else role="list" class="gr-bars">
            <li v-for="s in shares" :key="s.source">
              <span class="gr-bar-label">{{ s.label }}</span>
              <span
                class="meter gr-meter"
                :style="{ '--pct': `${Math.max(s.pct, 2)}%` }"
                role="img"
                :aria-label="`${s.pct}%`"
              ></span>
              <span class="mono tabular gr-count">{{ s.count }}</span>
            </li>
          </ul>
          <p v-if="skipped" class="gr-note">
            {{ skipped }} skipped the question.
          </p>
        </div>

        <div>
          <h3 class="label gr-sub">Sites sending real submissions · 30 days</h3>
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">
                Sites sending real submissions in the last 30 days
              </caption>
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col" class="num">Forms</th>
                  <th scope="col" class="num">Submissions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in growth.topSites" :key="s.host">
                  <td class="mono ad-value">{{ s.host }}</td>
                  <td class="num tabular">{{ s.forms }}</td>
                  <td class="num tabular">{{ s.submissions }}</td>
                </tr>
                <tr v-if="!growth.topSites.length">
                  <td colspan="3" class="muted">
                    No live forms yet. Testing from localhost doesn’t count.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped src="./admin-section.css"></style>
<style scoped>
.gr-tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: var(--bw-strong) solid var(--line-strong);
  background: var(--bg-raised);
}
.gr-tile {
  display: grid;
  gap: 0.4rem;
  padding: var(--s-4);
  min-width: 0;
}
.gr-tile + .gr-tile {
  border-left: 1px dashed var(--line);
}
.gr-label,
.gr-sub {
  color: var(--fg-muted);
}
.gr-num {
  font-family: var(--font-display);
  font-stretch: var(--stretch-condensed);
  font-weight: 900;
  font-size: clamp(2.2rem, 3.2vw, 3rem);
  line-height: 0.9;
}
.gr-note {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
.gr-two {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--s-6);
  margin-top: var(--s-5);
}
.gr-sub {
  display: block;
  margin-bottom: var(--s-3);
  text-align: left;
}
.gr-bars {
  display: grid;
  gap: var(--s-2);
}
.gr-bars li {
  display: grid;
  grid-template-columns: minmax(8rem, 13rem) minmax(0, 1fr) 2.5rem;
  align-items: center;
  gap: var(--s-3);
  font-size: var(--fs-sm);
}
.gr-meter {
  height: 10px;
}
.gr-count {
  text-align: right;
}
@media (max-width: 900px) {
  .gr-tiles,
  .gr-two {
    grid-template-columns: minmax(0, 1fr);
  }
  .gr-tile + .gr-tile {
    border-left: 0;
    border-top: 1px dashed var(--line);
  }
}
</style>
