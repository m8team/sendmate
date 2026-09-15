<script setup lang="ts">
/**
 * Bay 01, the pigeonholes: a column head, one PigeonholeRow per form (or three placeholders
 * while loading) and an empty slot at the end that makes a new form.
 */
import Icon from '../../ui/Icon.vue';
import PigeonholeRow from './PigeonholeRow.vue';
import { slotNo, type RackRow } from './rackRows';

defineProps<{ loading: boolean; rows: RackRow[]; now: number }>();
</script>

<template>
  <section class="rack-wrap" aria-labelledby="rack-title">
    <div class="rack-bar">
      <h2 id="rack-title" class="bay label label-lg"><span class="bay-no">01</span> Pigeonholes</h2>
    </div>

    <div class="rack-head" aria-hidden="true">
      <span class="label">No.</span>
      <span class="label">Form &amp; endpoint</span>
      <span class="label">Unread</span>
      <span class="label">This month</span>
      <span class="label">Last 30 days</span>
      <span class="label">Last in</span>
    </div>

    <ol role="list" class="rack">
      <template v-if="loading">
        <PigeonholeRow v-for="n in 3" :key="`skel-${n}`" :skeleton="n" :now="now" />
      </template>

      <PigeonholeRow v-for="r in rows" v-else :key="r.f.id" :row="r" :now="now" />

      <li v-if="!loading" class="hole hole-empty">
        <span class="hole-no mono" aria-hidden="true">{{ slotNo(rows.length) }}</span>
        <div class="empty-body">
          <p class="empty-title">{{ rows.length ? 'Empty pigeonhole' : 'Your first pigeonhole' }}</p>
          <p class="empty-note">Forms are free. Name one, pick where the post goes, paste the snippet. About thirty seconds.</p>
        </div>
        <a class="btn btn-sm empty-cta" :class="rows.length ? 'btn-outline' : 'btn-signal'" href="/app/onboarding"><Icon name="plus" :size="16" /> New form</a>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.rack-bar {
  margin-bottom: var(--s-3);
}
.rack-bar .bay {
  font-weight: 500;
}
/* .hole is also the root of each PigeonholeRow, so these rules reach it */
.rack-head,
.hole {
  display: grid;
  grid-template-columns: 3rem minmax(15rem, 1.7fr) 5.5rem minmax(8.5rem, 0.8fr) minmax(8rem, 0.9fr) 6.5rem 1.5rem;
  column-gap: clamp(0.75rem, 1.6vw, 1.5rem);
  align-items: center;
}
.rack-head {
  padding: 0 var(--s-4) var(--s-2);
  color: var(--fg-muted);
  border-bottom: var(--bw-heavy) solid var(--line-strong);
}
.rack {
  display: grid;
}

/* One pigeonhole per row: a heavy lip on top, compartment walls on the sides */
.hole {
  position: relative;
  padding: var(--s-4);
  border-bottom: var(--bw-strong) solid var(--line-strong);
  background: var(--bg);
  transition: background-color var(--dur-2) var(--ease-out);
}
.hole::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: transparent;
  transition: background-color var(--dur-2) var(--ease-out);
}
.hole:not(.hole-empty):hover {
  background: var(--bg-raised);
}
.hole:not(.hole-empty):hover::before,
.hole:not(.hole-empty):focus-within::before {
  background: var(--signal);
}

/* The empty slot at the end */
.hole-no {
  align-self: start;
  padding-top: 0.2rem;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--fg-muted);
}
.hole-empty {
  grid-template-columns: 3rem minmax(0, 1fr) auto;
  border: 2px dashed var(--line);
  border-top: 0;
  background: transparent;
}
.empty-title {
  font-family: var(--font-display);
  font-stretch: var(--stretch-semi);
  font-weight: 800;
  font-size: 1.2rem;
  line-height: 1.1;
}
.empty-note {
  font-size: var(--fs-sm);
  color: var(--fg-muted);
}

@media (max-width: 1240px) {
  .rack-head,
  .hole {
    grid-template-columns: 2.5rem minmax(13rem, 1.6fr) 5rem minmax(8rem, 1fr) 7rem 1.25rem;
  }
  .rack-head span:nth-child(5) {
    display: none;
  }
}

@media (max-width: 760px) {
  .rack-head {
    display: none;
  }
  .rack {
    border-top: var(--bw-heavy) solid var(--line-strong);
  }
  .hole {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--s-3);
    padding: var(--s-4) var(--s-3) var(--s-4) var(--s-4);
  }
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
  .hole-empty {
    grid-template-columns: minmax(0, 1fr);
  }
  .hole-empty > .empty-cta {
    grid-column: 1;
    justify-self: start;
  }
}
</style>
