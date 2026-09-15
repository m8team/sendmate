<script setup lang="ts">
/** Phishing guard: some post is held for review, or the whole form is under review. */
import InboxBanner from './InboxBanner.vue';

defineProps<{ flag: string | null; showReview: boolean }>();
const emit = defineEmits<{ review: [] }>();
</script>

<template>
  <InboxBanner class="notice-warn banner-slim" icon="alert" :title="flag ? 'This form is under review' : 'Phishing guard: some post is held'">
    <p v-if="flag">It was flagged ({{ flag }}), so new submissions are held for review instead of being delivered. Their contents stay hidden until the review is done.</p>
    <p v-else>
      Some submissions were held for review because they look like they’re collecting passwords or card details, or the form was reported. They aren’t delivered and their contents stay
      hidden.
    </p>
    <div v-if="showReview" class="banner-act">
      <button type="button" class="btn btn-outline btn-sm" @click="emit('review')">Review held post</button>
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
