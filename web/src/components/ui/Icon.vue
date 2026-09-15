<script setup lang="ts">
import { computed } from 'vue';
import { icons, type IconName } from './icons';

const props = withDefaults(
  defineProps<{ name: IconName; size?: number | string; label?: string; strokeWidth?: number }>(),
  { size: 20, strokeWidth: 1.75 },
);
const icon = computed(() => icons[props.name] as { d: string; fill?: boolean });
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="icon.fill ? 'currentColor' : 'none'"
    :stroke="icon.fill ? 'none' : 'currentColor'"
    :stroke-width="strokeWidth"
    stroke-linecap="square"
    stroke-linejoin="miter"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  >
    <path :d="icon.d" />
  </svg>
</template>
