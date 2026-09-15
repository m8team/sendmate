<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { channelMeta } from '../SettingsChannelRules';
import ChannelEmailFields from './ChannelEmailFields.vue';
import ChannelTelegramFields from './ChannelTelegramFields.vue';
import ChannelUrlField from './ChannelUrlField.vue';
import { useFormSettings } from './useFormSettings';

const { addChannel: add } = useFormSettings();
const { addType, addTypes, addErr, addBusy, addLabel, addLabelDefault, cancelAdd, addChannel } = add;
</script>

<template>
  <form class="addpanel" novalidate aria-labelledby="fs-add-title" @submit.prevent="addChannel">
    <h3 id="fs-add-title" class="h4">Add a channel</h3>
    <fieldset class="addtype">
      <legend class="field-label">Type</legend>
      <label v-for="t in addTypes" :key="t" class="addtype-opt" :class="{ on: addType === t }">
        <input v-model="addType" type="radio" name="fs-addtype" :value="t" class="sr-only" />
        <Icon :name="channelMeta[t].icon" :size="18" />
        <span>{{ channelMeta[t].name }}</span>
      </label>
    </fieldset>

    <div class="field">
      <label class="field-label" for="fs-add-label">Label <span class="muted">(optional)</span></label>
      <input
        id="fs-add-label"
        v-model="addLabel"
        class="input"
        maxlength="80"
        autocomplete="off"
        :placeholder="addLabelDefault"
        :aria-invalid="addErr.label ? 'true' : undefined"
        :aria-describedby="addErr.label ? 'fs-add-label-err' : 'fs-add-label-hint'"
      />
      <p v-if="addErr.label" id="fs-add-label-err" class="field-error"><Icon name="alert" :size="14" /> {{ addErr.label }}</p>
      <p v-else id="fs-add-label-hint" class="field-hint">How it shows up here and in the delivery journey. Leave it empty and we’ll name it for you.</p>
    </div>

    <ChannelEmailFields v-if="addType === 'email'" />
    <ChannelTelegramFields v-else-if="addType === 'telegram'" />
    <ChannelUrlField v-else :type="addType" />

    <div class="addpanel-actions">
      <button type="button" class="btn btn-ghost" @click="cancelAdd">Cancel</button>
      <button type="submit" class="btn btn-signal" :aria-disabled="addBusy ? 'true' : undefined">
        <Icon :name="addBusy ? 'clock' : 'plus'" /> {{ addBusy ? 'Checking…' : `Add ${channelMeta[addType].name}` }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.addpanel {
  display: grid;
  gap: var(--s-4);
  margin: 0 var(--s-5) var(--s-5);
  padding: var(--s-5);
  border: 2px dashed var(--line-strong);
  background: var(--bg);
}
.addtype {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  border: 0;
}
.addtype legend {
  width: 100%;
  margin-bottom: var(--s-2);
}
.addtype-opt {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0.5rem 0.8rem;
  border: 1.5px solid var(--line);
  border-radius: var(--r-1);
  font-weight: 600;
  font-size: var(--fs-sm);
  cursor: pointer;
}
.addtype-opt:hover {
  border-color: var(--line-strong);
}
.addtype-opt.on {
  background: var(--fg);
  color: var(--bg);
  border-color: var(--fg);
}
.addtype-opt:has(input:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 5px var(--focus-halo);
}
.addpanel-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-2);
  flex-wrap: wrap;
}
@media (max-width: 560px) {
  .addpanel {
    margin: 0 var(--s-3) var(--s-4);
    padding: var(--s-4);
  }
}
</style>
