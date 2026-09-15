<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import DestinationCard from './DestinationCard.vue';
import { channelMeta, hints, placeholders, type AddableChannel } from '../SettingsChannelRules';
import { useOnboarding } from './useOnboarding';

defineProps<{ t: AddableChannel }>();

const { chOn, chDraft, chErr, chLabel } = useOnboarding();
</script>

<template>
  <DestinationCard
    v-model="chOn[t]"
    :icon="channelMeta[t].icon"
    :name="channelMeta[t].name"
    :sub="t === 'webhook' ? 'Signed JSON POST' : t === 'telegram' ? 'Bot message' : 'Webhook message'"
  >
    <div class="field sub-label">
      <label class="field-label" :for="`ob-${t}-label`">Label <span class="muted">(optional)</span></label>
      <input
        :id="`ob-${t}-label`"
        v-model="chLabel[t]"
        class="input"
        maxlength="60"
        autocomplete="off"
        :placeholder="t === 'webhook' ? 'Zapier, CRM…' : t === 'telegram' ? 'My phone' : '#form-submissions'"
      />
    </div>
    <template v-if="t === 'telegram'">
      <div class="sub-grid">
        <div class="field">
          <label class="field-label" :for="`ob-${t}-token`">Bot token</label>
          <input
            :id="`ob-${t}-token`"
            v-model="chDraft[t].botToken"
            class="input mono"
            autocomplete="off"
            spellcheck="false"
            placeholder="123456789:AAH…"
            :aria-invalid="chErr[t].botToken ? 'true' : undefined"
            :aria-describedby="chErr[t].botToken ? `ob-${t}-token-err` : undefined"
          />
          <p v-if="chErr[t].botToken" :id="`ob-${t}-token-err`" class="field-error"><Icon name="alert" :size="14" /> {{ chErr[t].botToken }}</p>
        </div>
        <div class="field">
          <label class="field-label" :for="`ob-${t}-chat`">Chat id</label>
          <input
            :id="`ob-${t}-chat`"
            v-model="chDraft[t].chatId"
            class="input mono"
            autocomplete="off"
            spellcheck="false"
            placeholder="-1001234567890"
            :aria-invalid="chErr[t].chatId ? 'true' : undefined"
            :aria-describedby="chErr[t].chatId ? `ob-${t}-chat-err` : undefined"
          />
          <p v-if="chErr[t].chatId" :id="`ob-${t}-chat-err`" class="field-error"><Icon name="alert" :size="14" /> {{ chErr[t].chatId }}</p>
        </div>
      </div>
      <p class="field-hint">{{ hints[t] }}</p>
    </template>
    <div v-else class="field">
      <label class="field-label" :for="`ob-${t}-url`">{{ t === 'webhook' ? 'Endpoint URL' : `${channelMeta[t].name} webhook URL` }}</label>
      <input
        :id="`ob-${t}-url`"
        v-model="chDraft[t].url"
        class="input mono"
        type="url"
        autocomplete="off"
        spellcheck="false"
        :placeholder="placeholders[t]"
        :aria-invalid="chErr[t].url ? 'true' : undefined"
        :aria-describedby="chErr[t].url ? `ob-${t}-url-err ob-${t}-url-hint` : `ob-${t}-url-hint`"
      />
      <p v-if="chErr[t].url" :id="`ob-${t}-url-err`" class="field-error"><Icon name="alert" :size="14" /> {{ chErr[t].url }}</p>
      <p :id="`ob-${t}-url-hint`" class="field-hint">{{ hints[t] }}</p>
    </div>
  </DestinationCard>
</template>

<style scoped>
.sub-label {
  margin-bottom: var(--s-3);
}
.sub-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--s-3);
}

@media (max-width: 560px) {
  .sub-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
