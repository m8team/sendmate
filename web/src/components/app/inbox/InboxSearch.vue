<script setup lang="ts">
/** Search submissions (contents or ID). The parent debounces; this just holds the text and the focus. */
import { ref } from 'vue';
import Icon from '../../ui/Icon.vue';

const query = defineModel<string>({ required: true });
const input = ref<HTMLInputElement | null>(null);

function clear() {
  query.value = '';
  input.value?.focus();
}

defineExpose({ input, clear });
</script>

<template>
  <div class="search">
    <label for="inbox-search" class="sr-only">Search submissions</label>
    <Icon name="search" :size="16" class="search-ico" />
    <input
      id="inbox-search"
      ref="input"
      v-model="query"
      class="input search-input"
      type="search"
      autocomplete="off"
      spellcheck="false"
      placeholder="Search submissions"
    />
    <kbd v-if="!query" class="kbd search-kbd" aria-hidden="true">/</kbd>
    <button v-else type="button" class="search-clear" aria-label="Clear search" @click="clear"><Icon name="x" :size="16" /></button>
  </div>
</template>

<style scoped>
.search {
  position: relative;
}
.search-ico {
  position: absolute;
  left: 0.65rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--fg-muted);
  pointer-events: none;
}
.search-input {
  padding-left: 2rem;
  padding-right: 2.2rem;
  font-size: var(--fs-sm);
}
.search-input::-webkit-search-cancel-button {
  display: none;
}
.search-kbd {
  position: absolute;
  right: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--fg-muted);
}
.search-clear {
  position: absolute;
  right: 0.35rem;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border: 0;
  background: transparent;
  color: var(--fg-muted);
}
.search-clear:hover {
  color: var(--fg);
}
@media (pointer: coarse) {
  .search-kbd {
    display: none;
  }
}
</style>
