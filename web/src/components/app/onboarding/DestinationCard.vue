<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import type { IconName } from '../../ui/icons';

/**
 * One place submissions can go: a switch row that opens the destination's settings underneath.
 */
defineProps<{
  icon: IconName;
  name: string;
  sub: string;
  /** Id for the sub line, so the switch can be described by it. */
  subId?: string;
  /** `fieldset` when the body is a group of radios. */
  bodyTag?: 'div' | 'fieldset';
}>();
const on = defineModel<boolean>({ required: true });
</script>

<template>
  <div class="dest" :class="{ on }">
    <label class="dest-head">
      <input v-model="on" type="checkbox" class="switch" :aria-describedby="subId" />
      <span class="dest-icon" aria-hidden="true"><Icon :name="icon" :size="16" /></span>
      <span class="dest-name">{{ name }}</span>
      <span :id="subId" class="dest-sub">{{ sub }}</span>
    </label>
    <component :is="bodyTag ?? 'div'" v-if="on" class="dest-body">
      <slot />
    </component>
  </div>
</template>

<style scoped>
.dest {
  border: 1px solid var(--line);
  border-radius: var(--r-2);
}
.dest-head {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-3);
  cursor: pointer;
  flex-wrap: wrap;
}
.dest-icon {
  display: inline-grid;
  place-items: center;
  color: var(--fg-muted);
}
.dest.on .dest-icon {
  color: var(--fg);
}
.dest-name {
  font-weight: 600;
}
.dest-sub {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
.dest-body {
  display: grid;
  gap: var(--s-3);
  margin: 0;
  padding: var(--s-3);
  border: 0;
  border-top: 1px solid var(--line);
  min-width: 0;
}
fieldset.dest-body :slotted(legend) {
  float: left;
  width: 100%;
  margin-bottom: var(--s-2);
}

@media (max-width: 560px) {
  .dest-sub {
    display: none;
  }
}
</style>
