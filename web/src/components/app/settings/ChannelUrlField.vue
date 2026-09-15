<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { channelMeta, hints, placeholders, type AddableChannel } from '../SettingsChannelRules';
import { useFormSettings } from './useFormSettings';

/** Add channel, Discord / Slack / webhook: the one URL they need. */
defineProps<{ type: Exclude<AddableChannel, 'telegram'> }>();

const { addChannel } = useFormSettings();
const { addDraft, addErr } = addChannel;
</script>

<template>
  <div class="field">
    <label class="field-label" for="fs-add-url">{{ type === 'webhook' ? 'Endpoint URL' : `${channelMeta[type].name} webhook URL` }}</label>
    <input
      id="fs-add-url"
      v-model="addDraft.url"
      class="input mono"
      type="url"
      :placeholder="placeholders[type]"
      autocomplete="off"
      spellcheck="false"
      :aria-invalid="addErr.url ? 'true' : undefined"
      :aria-describedby="addErr.url ? 'fs-add-url-err fs-add-url-hint' : 'fs-add-url-hint'"
    />
    <p v-if="addErr.url" id="fs-add-url-err" class="field-error"><Icon name="alert" :size="14" /> {{ addErr.url }}</p>
    <p id="fs-add-url-hint" class="field-hint">
      {{ hints[type] }}<template v-if="type === 'webhook'"> We’ll generate a signing secret when you add it.</template>
    </p>
  </div>
</template>
