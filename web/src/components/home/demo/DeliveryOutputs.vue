<script setup lang="ts">
import { ref } from 'vue';
import Icon from '../../ui/Icon.vue';
import DiscordPreview from './DiscordPreview.vue';
import InboxPreview from './InboxPreview.vue';
import { useDemo } from './useDemo';

const { delivered } = useDemo();
/** Which window shows on narrow screens. Wide screens show both side by side. */
const outTab = ref<'email' | 'discord'>('email');
</script>

<template>
  <div class="outs">
    <div class="outs-tabs" role="tablist" aria-label="Where it landed">
      <button type="button" role="tab" :aria-selected="outTab === 'email'" class="outs-tab" @click="outTab = 'email'">
        <Icon name="mail" :size="16" /> Email <span v-if="delivered" class="dot-new">1</span>
      </button>
      <button type="button" role="tab" :aria-selected="outTab === 'discord'" class="outs-tab" @click="outTab = 'discord'">
        <Icon name="discord" :size="16" /> Discord <span v-if="delivered" class="dot-new">1</span>
      </button>
    </div>

    <InboxPreview :active="outTab === 'email'" />
    <DiscordPreview :active="outTab === 'discord'" />
  </div>
</template>

<style scoped>
.outs {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: var(--s-5);
  margin-top: var(--s-8);
}
.outs-tabs {
  display: none;
}

@media (max-width: 760px) {
  .outs {
    grid-template-columns: 1fr;
    gap: 0;
    margin-top: var(--s-7);
  }
  .outs-tabs {
    display: flex;
    gap: 2px;
    margin-bottom: -1px;
  }
  .outs-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--line);
    border-bottom: 0;
    background: transparent;
    color: var(--fg-muted);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    font-weight: 600;
  }
  .outs-tab[aria-selected='true'] {
    background: var(--bg-raised);
    color: var(--fg);
    box-shadow: inset 0 3px 0 var(--signal);
  }
  .dot-new {
    display: inline-grid;
    place-items: center;
    min-width: 1.1rem;
    height: 1.1rem;
    border-radius: 999px;
    background: var(--signal);
    color: var(--on-signal);
    font-size: 0.625rem;
  }
}
</style>
