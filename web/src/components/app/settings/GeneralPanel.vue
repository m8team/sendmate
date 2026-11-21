<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { validateRedirect } from '../SettingsChannelRules';
import AllowedDomains from './AllowedDomains.vue';
import { useFormSettings } from './useFormSettings';

const { current, draft, errors, zeroSignupAddress } = useFormSettings();

function blurRedirect() {
  errors.redirect = validateRedirect(draft.redirectUrl, draft.allowedOrigins);
}
</script>

<template>
  <section id="fs-panel-general" role="tabpanel" aria-labelledby="fs-tab-general" tabindex="0" class="panel">
    <header class="panel-head">
      <h2 class="h3">General</h2>
    </header>

    <div class="row">
      <div class="row-text">
        <label class="row-title" for="fs-name">Form name</label>
        <p class="row-desc">Only you see this.</p>
      </div>
      <div class="row-control field">
        <input
          id="fs-name"
          v-model="draft.name"
          class="input"
          autocomplete="off"
          :aria-invalid="errors.name ? 'true' : undefined"
          :aria-describedby="errors.name ? 'fs-name-err' : undefined"
        />
        <p v-if="errors.name" id="fs-name-err" class="field-error"><Icon name="alert" :size="14" /> {{ errors.name }}</p>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p id="fs-endpoint-label" class="row-title">Endpoint</p>
        <p class="row-desc">Use it as your form’s <code>action</code>.</p>
      </div>
      <div class="row-control">
        <div class="endpoint" role="group" aria-labelledby="fs-endpoint-label">
          <span class="endpoint-url"><span class="ep-base">{{ current.endpointBase }}</span><span class="ep-id">{{ current.id }}</span></span>
          <button type="button" class="btn btn-ghost btn-sm copy-btn" :data-copy="current.endpoint" data-copy-toast="Endpoint copied">
            <span class="copy-idle"><Icon name="copy" :size="16" /><span>Copy</span></span>
            <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /><span>Copied</span></span>
          </button>
        </div>
        <div v-if="current.emailEndpoint" class="endpoint" role="group" aria-label="Email address endpoint">
          <span class="endpoint-url"><span class="ep-base">{{ current.endpointBase }}</span><span class="ep-id">{{ zeroSignupAddress }}</span></span>
          <button type="button" class="btn btn-ghost btn-sm copy-btn" :data-copy="current.emailEndpoint" data-copy-toast="Email endpoint copied">
            <span class="copy-idle"><Icon name="copy" :size="16" /><span>Copy</span></span>
            <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /><span>Copied</span></span>
          </button>
        </div>
      </div>
    </div>

    <AllowedDomains />

    <div class="row">
      <div class="row-text">
        <label class="row-title" for="fs-redirect">Redirect after submit</label>
        <p class="row-desc">Where people go after submitting. Leave empty for our thank-you page.</p>
      </div>
      <div class="row-control field">
        <input
          id="fs-redirect"
          v-model="draft.redirectUrl"
          class="input mono"
          type="url"
          inputmode="url"
          spellcheck="false"
          :placeholder="`https://${(draft.allowedOrigins[0] ?? 'example.com').replace(/^\*\./, '')}/thanks`"
          :aria-invalid="errors.redirect ? 'true' : undefined"
          :aria-describedby="errors.redirect ? 'fs-redirect-err fs-redirect-hint' : 'fs-redirect-hint'"
          @blur="blurRedirect"
        />
        <p v-if="errors.redirect" id="fs-redirect-err" class="field-error"><Icon name="alert" :size="14" /> {{ errors.redirect }}</p>
        <p id="fs-redirect-hint" class="field-hint">A hidden <code>_next</code> field overrides this.</p>
      </div>
    </div>
  </section>
</template>

<style scoped src="./settings-panel.css"></style>
