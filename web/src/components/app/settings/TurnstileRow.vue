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
      <p class="row-desc">A “prove you’re human” check that’s nicer than a CAPTCHA. Pick how much setup you fancy.</p>
    </div>
    <div class="row-control options" role="radiogroup" aria-labelledby="fs-ts-title">
      <label class="option" :class="{ on: draft.turnstile === 'off' }">
        <input v-model="draft.turnstile" type="radio" class="check" name="fs-ts" value="off" />
        <span class="option-body">
          <span class="option-title">Off</span>
          <span class="option-desc">Honeypot, rate limits and heuristics only. Fine for most small sites.</span>
        </span>
      </label>
      <label class="option" :class="{ on: draft.turnstile === 'challenge' }">
        <input v-model="draft.turnstile" type="radio" class="check" name="fs-ts" value="challenge" />
        <span class="option-body">
          <span class="option-title">Challenge suspicious posts <span class="tag tag-plain">No setup</span></span>
          <span class="option-desc">Suspicious submissions get a quick check on a sendm8 page, then carry on to your redirect. Works with plain HTML forms.</span>
        </span>
      </label>
      <label class="option" :class="{ on: draft.turnstile === 'always' }">
        <input v-model="draft.turnstile" type="radio" class="check" name="fs-ts" value="always" />
        <span class="option-body">
          <span class="option-title">Always challenge <span class="tag tag-plain">No setup</span></span>
          <span class="option-desc">Every browser submission passes the check first. The strongest option without touching your site. AJAX forms skip it, so use your own widget for those.</span>
        </span>
      </label>
      <label class="option" :class="{ on: draft.turnstile === 'byo' }">
        <input v-model="draft.turnstile" type="radio" class="check" name="fs-ts" value="byo" />
        <span class="option-body">
          <span class="option-title">Bring your own widget <span class="tag tag-plain">AJAX forms</span></span>
          <span class="option-desc">Put a free Turnstile widget on your own site and paste its secret key. We check every <code>cf-turnstile-response</code>.</span>
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
          {{ hasStoredSecret ? 'A secret is saved and encrypted. Paste a new one to replace it.' : 'We check it with Cloudflare, then store it encrypted. We never show it again.' }}
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
  padding: var(--s-4);
  border: 1.5px solid var(--line-strong);
  border-top: 0;
  margin-top: calc(var(--s-2) * -1);
  background: var(--bg);
}
</style>
