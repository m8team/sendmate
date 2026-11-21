<script setup lang="ts">
import { ref } from 'vue';
import Icon from '../../ui/Icon.vue';
import { useFormSettings } from './useFormSettings';

/** Spam tab: the Cloudflare Turnstile mode, plus the secret key for "bring your own widget". */
const { draft, errors, hasStoredSecret } = useFormSettings();
const showSecret = ref(false);
</script>

<template>
  <div class="row">
    <div class="row-text">
      <p id="fs-ts-title" class="row-title">Cloudflare Turnstile</p>
      <p class="row-desc">A quick “are you human” check.</p>
    </div>
    <div class="row-control options" role="radiogroup" aria-labelledby="fs-ts-title">
      <label class="option" :class="{ on: draft.turnstile === 'off' }">
        <input v-model="draft.turnstile" type="radio" class="check" name="fs-ts" value="off" />
        <span class="option-body">
          <span class="option-title">Off</span>
          <span class="option-desc">Fine for most small sites.</span>
        </span>
      </label>
      <label class="option" :class="{ on: draft.turnstile === 'challenge' }">
        <input v-model="draft.turnstile" type="radio" class="check" name="fs-ts" value="challenge" />
        <span class="option-body">
          <span class="option-title">Suspicious submissions only</span>
          <span class="option-desc">No setup. Works with plain HTML forms.</span>
        </span>
      </label>
      <label class="option" :class="{ on: draft.turnstile === 'always' }">
        <input v-model="draft.turnstile" type="radio" class="check" name="fs-ts" value="always" />
        <span class="option-body">
          <span class="option-title">Every submission</span>
          <span class="option-desc">No setup. Not for AJAX forms.</span>
        </span>
      </label>
      <label class="option" :class="{ on: draft.turnstile === 'byo' }">
        <input v-model="draft.turnstile" type="radio" class="check" name="fs-ts" value="byo" />
        <span class="option-body">
          <span class="option-title">Your own widget</span>
          <span class="option-desc">Add Turnstile to your site and paste its secret key. Works with AJAX.</span>
        </span>
      </label>
      <div v-if="draft.turnstile === 'byo'" class="field option-extra">
        <label class="field-label" for="fs-secret">Turnstile secret key</label>
        <div class="pwrow">
          <input
            id="fs-secret"
            v-model="draft.turnstileSecret"
            class="input mono"
            :type="showSecret ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
            :placeholder="hasStoredSecret ? '0x4AAA•••••••••••••• (saved)' : '0x4AAAAAAA…'"
            :aria-invalid="errors.secret ? 'true' : undefined"
            :aria-describedby="errors.secret ? 'fs-secret-err fs-secret-hint' : 'fs-secret-hint'"
          />
          <button type="button" class="btn btn-outline pwbtn" :aria-pressed="showSecret" @click="showSecret = !showSecret">
            <Icon :name="showSecret ? 'eye-off' : 'eye'" :size="16" /><span class="sr-only">{{ showSecret ? 'Hide' : 'Show' }} secret key</span>
          </button>
        </div>
        <p v-if="errors.secret" id="fs-secret-err" class="field-error"><Icon name="alert" :size="14" /> {{ errors.secret }}</p>
        <p id="fs-secret-hint" class="field-hint">
          {{ hasStoredSecret ? 'Saved. Paste a new one to replace it.' : 'Stored encrypted. It won’t be shown again.' }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped src="./settings-panel.css"></style>
<style scoped src="./option-cards.css"></style>
<style scoped src="./secret-input.css"></style>
<style scoped>
.option-extra {
  padding: var(--s-3);
  border-top: 1px solid var(--line);
  background: var(--bg-sunk);
}
</style>
