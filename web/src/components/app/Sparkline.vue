<script setup lang="ts">
/**
 * Sparkline for client-rendered pages: one path, one area, weekly ticks.
 * Accessible as a single image with a written summary (pass `label`).
 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{ data: number[]; label: string; width?: number; height?: number }>(), { width: 168, height: 44 });

const padX = 3;
const padTop = 5;
const padBottom = 7;

const geo = computed(() => {
  const data = props.data.length ? props.data : [0];
  const { width, height } = props;
  const max = Math.max(1, ...data);
  const n = Math.max(1, data.length - 1);
  const x = (i: number) => padX + (i / n) * (width - padX * 2);
  const y = (v: number) => padTop + (1 - v / max) * (height - padTop - padBottom);
  const base = height - padBottom;
  const pts = data.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)} ${base} L${x(0).toFixed(1)} ${base} Z`;
  const last = pts[pts.length - 1];
  const peakIndex = data.indexOf(Math.max(...data));
  const peak = data[peakIndex] > 0 ? pts[peakIndex] : null;
  const ticks = data.map((_, i) => i).filter((i) => (data.length - 1 - i) % 7 === 0).map(x);
  return { base, line, area, last, peak, ticks };
});
</script>

<template>
  <svg class="spark" :viewBox="`0 0 ${width} ${height}`" :width="width" :height="height" role="img" :aria-label="label" focusable="false">
    <line class="spark-base" :x1="padX" :x2="width - padX" :y1="geo.base" :y2="geo.base"></line>
    <line v-for="(tx, i) in geo.ticks" :key="i" class="spark-tick" :x1="tx" :x2="tx" :y1="geo.base" :y2="geo.base + 4"></line>
    <path class="spark-area" :d="geo.area"></path>
    <path class="spark-line" :d="geo.line"></path>
    <circle v-if="geo.peak" class="spark-peak" :cx="geo.peak[0]" :cy="geo.peak[1]" r="2"></circle>
    <rect class="spark-last" :x="geo.last[0] - 3" :y="geo.last[1] - 3" width="6" height="6"></rect>
  </svg>
</template>

<style scoped>
.spark {
  display: block;
  width: 100%;
  max-width: var(--spark-w, 100%);
  height: auto;
  overflow: visible;
}
.spark-base {
  stroke: var(--line-strong);
  stroke-width: 1;
}
.spark-tick {
  stroke: var(--fg-subtle);
  stroke-width: 1;
}
.spark-area {
  fill: color-mix(in srgb, var(--fg) 9%, transparent);
}
.spark-line {
  fill: none;
  stroke: var(--fg);
  stroke-width: 1.6;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.spark-peak {
  fill: var(--bg);
  stroke: var(--fg);
  stroke-width: 1.2;
}
.spark-last {
  fill: var(--signal);
}
</style>
