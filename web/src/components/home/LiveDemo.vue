<script setup lang="ts">
import DeliveryOutputs from './demo/DeliveryOutputs.vue';
import DispatchDocket from './demo/DispatchDocket.vue';
import SortingTrack from './demo/SortingTrack.vue';
import { provideDemo } from './demo/useDemo';

/** The hero: poster headline + dispatch docket, then the sorting line and where the post lands. */
const { stage, status, lineEl } = provideDemo();
</script>

<template>
  <div class="demo">
    <!-- ================= Top: poster headline + docket ================= -->
    <div class="wrap demo-top">
      <div class="demo-headline">
        <slot name="headline" />
      </div>
      <div class="demo-intro">
        <slot name="intro" />
      </div>

      <DispatchDocket />
    </div>

    <!-- ================= The sorting line ================= -->
    <div ref="lineEl" class="band-ink line" :data-stage="stage">
      <div class="wrap">
        <div class="line-head">
          <p class="label"><span class="bay-no">↓</span> Meanwhile, at sendm8</p>
          <p class="line-status mono" role="status" aria-live="polite">{{ status }}</p>
        </div>

        <SortingTrack />
        <DeliveryOutputs />
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo-top {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  grid-template-areas: "head head" "intro docket";
  column-gap: var(--s-6);
  align-items: start;
  padding-top: clamp(2rem, 5vw, 4.5rem);
  padding-bottom: clamp(3rem, 6vw, 5.5rem);
}
.demo-headline {
  grid-area: head;
  position: relative;
  z-index: 1;
  min-width: 0;
}
.demo-intro {
  grid-area: intro;
  padding-top: var(--s-6);
  position: relative;
  z-index: 1;
  min-width: 0;
}

/* ---------- Sorting line ---------- */
.line {
  padding-block: var(--s-7) var(--s-8);
  border-top: 1px solid var(--line);
  scroll-margin-top: 4.5rem;
}
.line-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--s-4);
  flex-wrap: wrap;
  color: var(--fg-muted);
}
.line-status {
  font-size: var(--fs-xs);
  color: var(--fg);
}

@media (max-width: 1100px) {
  .demo-top {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: "head" "intro" "docket";
    row-gap: var(--s-6);
  }
  .demo-intro {
    padding-top: 0;
  }
}
</style>
