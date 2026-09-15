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
      <p class="muted">The basics: what it’s called, where it lives, and who’s allowed to post to it.</p>
    </header>

    <div class="row">
      <div class="row-text">
        <label class="row-title" for="fs-name">Form name</label>
        <p class="row-desc">Shows in your dashboard and in email subjects. Nobody else sees it.</p>
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
        <p class="row-desc">
          Put this in your form’s <code>action</code>. The id is permanent, so links don’t break.
          <template v-if="zeroSignupAddress"> It started life as a zero-signup form, so its email address endpoint keeps working too.</template>
        </p>
      </div>
      <div class="row-control">
        <div class="endpoint" role="group" aria-labelledby="fs-endpoint-label">
          <span class="endpoint-url"><span class="ep-base">{{ current.endpointBase }}</span><span class="ep-id">{{ current.id }}</span></span>
          <button type="button" class="btn btn-sm copy-btn" :data-copy="current.endpoint" data-copy-toast="Endpoint copied">
            <span class="copy-idle"><Icon name="copy" :size="16" /><span>Copy</span></span>
            <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /><span>Copied</span></span>
          </button>
        </div>
        <div v-if="current.emailEndpoint" class="endpoint" role="group" aria-label="Email address endpoint">
          <span class="endpoint-url"><span class="ep-base">{{ current.endpointBase }}</span><span class="ep-id">{{ zeroSignupAddress }}</span></span>
          <button type="button" class="btn btn-sm copy-btn" :data-copy="current.emailEndpoint" data-copy-toast="Email endpoint copied">
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
        <p class="row-desc">Where people land after posting. If you’ve set allowed domains, keep it on one of them. Leave it empty to use our plain thank-you page.</p>
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
        <p id="fs-redirect-hint" class="field-hint">A hidden <code>_next</code> field in your form overrides this, as long as it points at the site the form is on.</p>
      </div>
    </div>
  </section>
</template>

<style scoped src="./settings-panel.css"></style>
