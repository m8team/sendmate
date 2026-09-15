<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { NEW_ADDRESS } from './channelHelpers';
import { useFormSettings } from './useFormSettings';

/** Add channel, email: pick a recipient address, or type a new one to verify. */
const { addressesLoaded, addChannel } = useFormSettings();
const { pickableAddresses, addEmailChoice, addNewEmail, addErr } = addChannel;
</script>

<template>
  <fieldset class="field addtype-email">
    <legend class="field-label">Send to</legend>
    <p v-if="!addressesLoaded" class="skel" style="height: 2.4rem"></p>
    <label v-for="a in pickableAddresses" :key="a.id" class="option" :class="{ on: addEmailChoice === a.id }">
      <input v-model="addEmailChoice" type="radio" class="check" name="fs-add-email" :value="a.id" />
      <span class="option-body">
        <span class="option-title mono">{{ a.email }} <span :class="a.verified ? 'tag tag-ok' : 'tag tag-warn'">{{ a.verified ? 'Verified' : 'Not verified yet' }}</span></span>
      </span>
    </label>
    <label class="option" :class="{ on: addEmailChoice === NEW_ADDRESS }">
      <input v-model="addEmailChoice" type="radio" class="check" name="fs-add-email" :value="NEW_ADDRESS" />
      <span class="option-body"><span class="option-title">A different address</span></span>
    </label>
    <div v-if="addEmailChoice === NEW_ADDRESS" class="field">
      <label class="field-label" for="fs-add-email-new">New address</label>
      <input
        id="fs-add-email-new"
        v-model="addNewEmail"
        class="input"
        type="email"
        autocomplete="email"
        placeholder="hello@yourdomain.com"
        :aria-invalid="addErr.email ? 'true' : undefined"
        :aria-describedby="addErr.email ? 'fs-add-email-err' : 'fs-add-email-hint'"
      />
      <p id="fs-add-email-hint" class="field-hint">We’ll email it a verification link. Nothing is sent there until it’s clicked.</p>
    </div>
    <p v-if="addErr.email" id="fs-add-email-err" class="field-error"><Icon name="alert" :size="14" /> {{ addErr.email }}</p>
  </fieldset>
</template>

<style scoped src="./option-cards.css"></style>
<style scoped>
.addtype-email {
  display: grid;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  border: 0;
}
</style>
