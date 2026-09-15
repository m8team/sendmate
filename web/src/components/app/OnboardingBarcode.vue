<script setup lang="ts">
import { computed } from 'vue';
import { barsFor } from './SettingsChannelRules';

const props = withDefaults(defineProps<{ value: string; height?: number }>(), { height: 40 });
const data = computed(() => barsFor(props.value || 'SM8'));
</script>

<template>
  <svg class="ob-barcode" :viewBox="`0 0 ${data.width} 40`" preserveAspectRatio="none" :style="{ height: `${height}px` }" aria-hidden="true" focusable="false">
    <rect v-for="(b, i) in data.bars" :key="i" :x="b.x" y="0" :width="b.w" height="40" />
  </svg>
</template>

<style scoped>
.ob-barcode {
  width: 100%;
  display: block;
}
rect {
  fill: currentColor;
}
</style>
