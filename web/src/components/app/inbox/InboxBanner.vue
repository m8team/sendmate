<script setup lang="ts">
/** A slim notice strip across the top of the inbox. Tone classes (notice-warn…) fall through. */
import Icon from '../../ui/Icon.vue';
import type { IconName } from '../../ui/icons';

defineProps<{ icon: IconName; title: string }>();
</script>

<template>
  <div class="notice banner" role="note">
    <span class="notice-icon"><Icon :name="icon" :size="20" /></span>
    <p class="notice-title">{{ title }}</p>
    <div class="notice-body banner-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.banner {
  margin: var(--s-3) clamp(1rem, 2.5vw, 2rem) 0;
  padding: 0.75rem 1rem;
}
.banner-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-5);
}
/* the body is a row: copy on the left, a control on the right */
.banner-body > :slotted(*) {
  margin-top: 0;
}
.banner-body > :slotted(p) {
  flex: 1 1 28rem;
  margin: 0;
}
@media (max-width: 720px) {
  .banner {
    margin: var(--s-3) var(--s-3) 0;
  }
}
</style>
