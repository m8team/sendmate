<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import KeyCheckProgress from './KeyCheckProgress.vue';
import { useEmailAccount } from './useEmailAccount';

/** Paste a Resend key and from address; we check both with Resend before saving. */
const { fromPlaceholder, resendKey } = useEmailAccount();
const { replacing, checking, key, show, formatError, from, fromError, apiError, checkStep, connect, cancelReplace } = resendKey;
</script>

<template>
  <form class="keyform" novalidate @submit.prevent="connect">
    <div class="field">
      <label class="field-label" for="rk-key">Resend API key</label>
      <div class="pwrow">
        <input
          id="rk-key"
          v-model="key"
          class="input mono"
          :type="show ? 'text' : 'password'"
          autocomplete="off"
          spellcheck="false"
          placeholder="re_…"
          :readonly="checking"
          :aria-invalid="formatError || apiError ? 'true' : undefined"
          :aria-describedby="formatError ? 'rk-key-err rk-key-hint' : apiError ? 'rk-api-err rk-key-hint' : 'rk-key-hint'"
          @input="formatError = ''"
        />
        <button type="button" class="btn btn-outline pwbtn" :aria-pressed="show" @click="show = !show">
          <Icon :name="show ? 'eye-off' : 'eye'" :size="16" /> <span class="pwbtn-text">{{ show ? 'Hide' : 'Show' }}</span><span class="sr-only"> key</span>
        </button>
      </div>
      <p v-if="formatError" id="rk-key-err" class="field-error"><Icon name="alert" :size="14" /> {{ formatError }}</p>
      <p id="rk-key-hint" class="field-hint">
        In Resend: API Keys → Create API key (full access).
      </p>
    </div>

    <div class="field">
      <label class="field-label" for="rk-from">Send notifications from</label>
      <input
        id="rk-from"
        v-model="from"
        class="input mono"
        autocomplete="off"
        spellcheck="false"
        :placeholder="fromPlaceholder"
        :readonly="checking"
        :aria-invalid="fromError ? 'true' : undefined"
        :aria-describedby="fromError ? 'rk-from-err rk-from-hint' : 'rk-from-hint'"
        @input="fromError = ''"
      />
      <p v-if="fromError" id="rk-from-err" class="field-error"><Icon name="alert" :size="14" /> {{ fromError }}</p>
      <p id="rk-from-hint" class="field-hint">Must be on a domain you’ve verified in Resend.</p>
    </div>

    <div v-if="apiError" id="rk-api-err" class="notice notice-signal" role="alert">
      <span class="notice-icon"><Icon name="alert" :size="18" /></span>
      <p class="notice-title">{{ apiError.title }}</p>
      <div class="notice-body"><p>{{ apiError.body }}</p></div>
    </div>

    <KeyCheckProgress v-if="checking" :step="checkStep" />

    <div class="keyform-actions">
      <button type="submit" class="btn btn-outline" :aria-disabled="checking ? 'true' : undefined">
        {{ checking ? 'Checking…' : replacing ? 'Replace key' : 'Connect' }}
      </button>
      <button v-if="replacing" type="button" class="btn btn-ghost" @click="cancelReplace">Cancel</button>
    </div>
  </form>
</template>

<style scoped src="./account-panel.css"></style>
<style scoped>
.keyform {
  display: grid;
  gap: var(--s-4);
}
.pwrow {
  display: flex;
  gap: var(--s-2);
}
.pwrow .input {
  flex: 1;
  min-width: 0;
}
.pwbtn {
  padding-inline: 0.85rem;
}
.keyform-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-3) var(--s-4);
}
@media (max-width: 560px) {
  .pwbtn-text {
    display: none;
  }
  .keyform-actions .btn {
    width: 100%;
  }
}
</style>
