<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { hints } from '../SettingsChannelRules';
import { useFormSettings } from './useFormSettings';

/** Add channel, Telegram: bot token and chat id. */
const { addChannel } = useFormSettings();
const { addDraft, addErr } = addChannel;
</script>

<template>
  <div class="add-grid">
    <div class="field">
      <label class="field-label" for="fs-add-token">Bot token</label>
      <input
        id="fs-add-token"
        v-model="addDraft.botToken"
        class="input mono"
        placeholder="123456789:AAH…"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="addErr.botToken ? 'true' : undefined"
        :aria-describedby="addErr.botToken ? 'fs-add-token-err' : undefined"
      />
      <p v-if="addErr.botToken" id="fs-add-token-err" class="field-error"><Icon name="alert" :size="14" /> {{ addErr.botToken }}</p>
    </div>
    <div class="field">
      <label class="field-label" for="fs-add-chat">Chat id</label>
      <input
        id="fs-add-chat"
        v-model="addDraft.chatId"
        class="input mono"
        placeholder="-1001234567890"
        autocomplete="off"
        spellcheck="false"
        :aria-invalid="addErr.chatId ? 'true' : undefined"
        :aria-describedby="addErr.chatId ? 'fs-add-chat-err' : undefined"
      />
      <p v-if="addErr.chatId" id="fs-add-chat-err" class="field-error"><Icon name="alert" :size="14" /> {{ addErr.chatId }}</p>
    </div>
    <p class="field-hint add-wide">{{ hints.telegram }}</p>
  </div>
</template>

<style scoped>
.add-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--s-3);
}
.add-wide {
  grid-column: 1 / -1;
}
@media (max-width: 560px) {
  .add-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
