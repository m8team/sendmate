<script setup lang="ts">
/**
 * One submission, opened: the parcel label, why it wasn't delivered (if it wasn't),
 * then contents, delivery journey, spam check and postmarks. The pieces live in ./inbox.
 */
import Icon from '../ui/Icon.vue';
import type { Channel, Form, Submission } from '../../lib/api/types';
import AttachedFiles from './inbox/AttachedFiles.vue';
import ContentsTable from './inbox/ContentsTable.vue';
import DeliveryJourney from './inbox/DeliveryJourney.vue';
import DeliveryNotice from './inbox/DeliveryNotice.vue';
import PostmarkList from './inbox/PostmarkList.vue';
import SpamGauge from './inbox/SpamGauge.vue';
import TrackingTicket from './inbox/TrackingTicket.vue';

defineProps<{
  s: Submission;
  form: Form;
  formStatus: Form['status'];
  channels: Channel[];
  now: number;
  released: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  digestHourUtc: number;
  spamRetentionDays: number;
  maxDeliveryAttempts: number;
  retrying: boolean;
}>();

const emit = defineEmits<{
  back: [];
  prev: [];
  next: [];
  star: [];
  spam: [];
  release: [];
  delete: [];
  retry: [];
}>();
</script>

<template>
  <article class="det" :aria-labelledby="`det-h-${s.id}`">
    <!-- Mobile-only bar: back to the list, flick through post -->
    <div class="det-bar">
      <button type="button" class="btn btn-ghost btn-sm det-back" @click="emit('back')">
        <Icon name="arrow-left" :size="18" /> <span>{{ form.name }}</span>
      </button>
      <div class="det-flick">
        <button type="button" class="icon-btn" :disabled="!hasPrev" aria-label="Newer submission" @click="emit('prev')"><Icon name="arrow-down" :size="16" style="transform: rotate(180deg)" /></button>
        <button type="button" class="icon-btn" :disabled="!hasNext" aria-label="Older submission" @click="emit('next')"><Icon name="arrow-down" :size="16" /></button>
      </div>
    </div>

    <div class="det-inner">
      <TrackingTicket :s="s" :form-name="form.name" :now="now" :released="released" @star="emit('star')" @spam="emit('spam')" @release="emit('release')" @delete="emit('delete')" />

      <DeliveryNotice :s="s" :spam-retention-days="spamRetentionDays" @release="emit('release')" />

      <section class="blk" aria-labelledby="blk-contents">
        <h3 id="blk-contents" class="bay label"><span class="bay-no">A</span> Contents</h3>
        <ContentsTable :s="s" />
        <AttachedFiles :files="s.files" :dropped="s.droppedFiles" />
      </section>

      <div class="det-grid">
        <section class="blk" aria-labelledby="blk-journey">
          <h3 id="blk-journey" class="bay label"><span class="bay-no">B</span> Delivery journey</h3>
          <DeliveryJourney
            :s="s"
            :form-id="form.id"
            :form-status="formStatus"
            :channels="channels"
            :now="now"
            :digest-hour-utc="digestHourUtc"
            :spam-retention-days="spamRetentionDays"
            :max-delivery-attempts="maxDeliveryAttempts"
            :retrying="retrying"
            @retry="emit('retry')"
            @release="emit('release')"
          />
        </section>

        <div class="det-side">
          <section class="blk" aria-labelledby="blk-spam">
            <h3 id="blk-spam" class="bay label"><span class="bay-no">C</span> Spam check</h3>
            <SpamGauge :s="s" />
          </section>

          <section class="blk" aria-labelledby="blk-meta">
            <h3 id="blk-meta" class="bay label"><span class="bay-no">D</span> Postmarks</h3>
            <PostmarkList :s="s" />
          </section>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.det {
  container: det / inline-size;
  min-height: 100%;
}
.det-bar {
  display: none;
}
.det-inner {
  max-width: 72rem;
  padding: clamp(1rem, 2.4vw, 2rem);
  display: grid;
  gap: var(--s-6);
}

/* ---- Blocks ------------------------------------------------------------ */
.blk {
  display: grid;
  gap: var(--s-3);
  align-content: start;
  min-width: 0;
}
.det-grid {
  display: grid;
  gap: var(--s-6);
}
.det-side {
  display: grid;
  gap: var(--s-6);
  align-content: start;
}
@container det (min-width: 46rem) {
  .det-grid {
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: var(--s-6) clamp(1.5rem, 3cqi, 3rem);
  }
}

/* ---- Mobile: full-screen detail with a back bar ------------------------ */
@media (max-width: 720px) {
  .det-bar {
    position: sticky;
    top: 0;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    min-height: 3.5rem;
    padding: 0.4rem 0.6rem;
    background: var(--bg);
    border-bottom: var(--bw-strong) solid var(--line-strong);
  }
  .det-back {
    min-width: 0;
    padding-left: 0.3rem;
  }
  .det-back span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .det-flick {
    display: flex;
    gap: var(--s-1);
  }
  .det-flick .icon-btn {
    width: 2.6rem;
    height: 2.6rem;
  }
  .det-flick .icon-btn:disabled {
    opacity: 0.35;
  }
  .det-inner {
    padding: var(--s-4) var(--s-4) var(--s-8);
  }
}
</style>
