<script setup lang="ts">
/** Filters get things wrong: when something was binned this week, say so instead of hiding it. */
import InboxBanner from './InboxBanner.vue';

defineProps<{ note: string }>();
const emit = defineEmits<{ review: []; dismiss: [] }>();
</script>

<template>
  <InboxBanner class="banner-slim" icon="shield" :title="note">
    <p>Our spam filters kept them out of your inbox. Worth a quick look in case anything real got caught.</p>
    <div class="banner-act">
      <button type="button" class="btn btn-outline btn-sm" @click="emit('review')">Review spam</button>
      <button type="button" class="btn btn-ghost btn-sm" @click="emit('dismiss')">Dismiss</button>
    </div>
  </InboxBanner>
</template>

<style scoped>
.banner-act {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  flex: 0 1 auto;
}
@media (max-width: 720px) {
  .banner-act {
    flex-wrap: wrap;
  }
}
</style>
