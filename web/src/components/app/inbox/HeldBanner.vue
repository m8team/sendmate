<script setup lang="ts">
/** Phishing guard: some post is held for review, or the whole form is under review. */
import InboxBanner from './InboxBanner.vue';

defineProps<{ flag: string | null; showReview: boolean }>();
const emit = defineEmits<{ review: [] }>();
</script>

<template>
  <InboxBanner class="notice-warn banner-slim" icon="alert" :title="flag ? 'This form is under review' : 'Some submissions are held'">
    <p v-if="flag">It was flagged ({{ flag }}), so new submissions are held and not delivered until the review is done.</p>
    <p v-else>They look like they’re collecting passwords or card details, so they weren’t delivered.</p>
    <div v-if="showReview" class="banner-act">
      <button type="button" class="btn btn-outline btn-sm" @click="emit('review')">Review held</button>
    </div>
  </InboxBanner>
</template>

<style scoped>
.banner-act {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  flex: 0 1 auto;
}
@media (max-width: 720px) {
  .banner-act {
    flex-wrap: wrap;
  }
}
</style>
