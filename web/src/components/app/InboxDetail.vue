<script setup lang="ts">
/**
 * One submission, opened: sender and actions, why it wasn't delivered (if it wasn't),
 * then the message, delivery, spam check and details, in one column. The pieces live in ./inbox.
 */
import Icon from '../ui/Icon.vue';
import type { Channel, Form, Submission } from '../../lib/api/types';
import AttachedFiles from './inbox/AttachedFiles.vue';
import ContentsTable from './inbox/ContentsTable.vue';
import DeliveryJourney from './inbox/DeliveryJourney.vue';
import DeliveryNotice from './inbox/DeliveryNotice.vue';
import SpamGauge from './inbox/SpamGauge.vue';
import SubmissionHeader from './inbox/SubmissionHeader.vue';
import SubmissionMeta from './inbox/SubmissionMeta.vue';

defineProps<{
  s: Submission;
  form: Form;
  formStatus: Form['status'];
  channels: Channel[];
  now: number;
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
        <Icon name="arrow-left" :size="16" /> <span>{{ form.name }}</span>
      </button>
      <div class="det-flick">
        <button type="button" class="icon-btn" :disabled="!hasPrev" aria-label="Newer submission" @click="emit('prev')"><Icon name="arrow-down" :size="16" style="transform: rotate(180deg)" /></button>
        <button type="button" class="icon-btn" :disabled="!hasNext" aria-label="Older submission" @click="emit('next')"><Icon name="arrow-down" :size="16" /></button>
      </div>
    </div>

    <div class="det-inner">
      <SubmissionHeader :s="s" :form-name="form.name" :now="now" @star="emit('star')" @spam="emit('spam')" @release="emit('release')" @delete="emit('delete')" />
      <DeliveryNotice :s="s" :spam-retention-days="spamRetentionDays" @release="emit('release')" />

      <section class="blk" aria-labelledby="blk-contents">
        <h3 id="blk-contents" class="blk-h">Message</h3>
        <ContentsTable :s="s" />
        <AttachedFiles :files="s.files" :dropped="s.droppedFiles" />
      </section>

      <section class="blk" aria-labelledby="blk-journey">
        <h3 id="blk-journey" class="blk-h">Delivery</h3>
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
        />
      </section>

      <section class="blk" aria-labelledby="blk-spam">
        <h3 id="blk-spam" class="blk-h">Spam check</h3>
        <SpamGauge :s="s" />
      </section>

      <section class="blk" aria-labelledby="blk-meta">
        <h3 id="blk-meta" class="blk-h">Details</h3>
        <SubmissionMeta :s="s" />
      </section>
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
/* One column, one left edge: header, notices and every section line up. */
.det-inner {
  max-width: 46rem;
  padding: var(--s-5) var(--app-gutter) var(--s-7);
  display: grid;
  gap: var(--s-5);
}
.blk {
  display: grid;
  gap: var(--s-3);
  min-width: 0;
  padding-top: var(--s-5);
  border-top: 1px solid var(--line);
}
.blk-h {
  font-size: var(--fs-sm);
  font-weight: 600;
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
    min-height: var(--app-topbar-h);
    padding: 0.3rem 0.5rem;
    background: var(--bg);
    border-bottom: 1px solid var(--line);
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
    width: 2.5rem;
    height: 2.5rem;
  }
  .det-flick .icon-btn:disabled {
    opacity: 0.35;
  }
  .det-inner {
    padding: var(--s-4) var(--s-4) var(--s-8);
  }
}
</style>
