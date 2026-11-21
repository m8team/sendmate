<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import TurnstileRow from './TurnstileRow.vue';
import { honeypotSnippet, riskyFields as findRisky } from './settingsHelpers';
import { useFormSettings } from './useFormSettings';

const { current, draft, errors, fieldNames, limits } = useFormSettings();

const snippet = computed(() => honeypotSnippet(draft.honeypotField));
const riskyFields = computed(() => findRisky(fieldNames.value));
</script>

<template>
  <section id="fs-panel-spam" role="tabpanel" aria-labelledby="fs-tab-spam" tabindex="0" class="panel">
    <header class="panel-head">
      <h2 class="h3">Spam</h2>
      <p class="muted">Spam is kept in your Spam folder for {{ limits.spamRetentionDays }} days but never delivered.</p>
    </header>

    <div class="row">
      <div class="row-text">
        <label class="row-title" for="fs-honeypot">Honeypot field</label>
        <p class="row-desc">A hidden field only bots fill in. <code>_gotcha</code> always works.</p>
      </div>
      <div class="row-control field">
        <div class="pwrow">
          <input
            id="fs-honeypot"
            v-model="draft.honeypotField"
            class="input mono"
            spellcheck="false"
            autocomplete="off"
            placeholder="_gotcha (built in)"
            :aria-invalid="errors.honeypot ? 'true' : undefined"
            :aria-describedby="errors.honeypot ? 'fs-honeypot-err fs-honeypot-hint' : 'fs-honeypot-hint'"
          />
          <button v-if="draft.honeypotField" type="button" class="btn btn-outline pwbtn" @click="draft.honeypotField = ''">
            <Icon name="x" :size="16" /> Clear<span class="sr-only"> custom honeypot</span>
          </button>
        </div>
        <p v-if="errors.honeypot" id="fs-honeypot-err" class="field-error"><Icon name="alert" :size="14" /> {{ errors.honeypot }}</p>
        <p id="fs-honeypot-hint" class="field-hint">
          {{
            current.honeypotField && !draft.honeypotField.trim()
              ? `Saving removes “${current.honeypotField}”. The built-in _gotcha and _honeypot keep working.`
              : 'Optional. Add a custom field name.'
          }}
        </p>
        <div class="codeblock codeblock-compact">
          <div class="cb-head">
            <span class="label cb-name">HTML</span>
            <button type="button" class="btn btn-ghost btn-xs copy-btn" :data-copy="snippet" data-copy-toast="Honeypot copied">
              <span class="copy-idle"><Icon name="copy" :size="14" /><span>Copy</span></span>
              <span class="copy-done" aria-hidden="true"><Icon name="check" :size="14" /><span>Copied</span></span>
            </button>
          </div>
          <div class="cb-body"><pre><code>{{ snippet }}</code></pre></div>
        </div>
      </div>
    </div>

    <TurnstileRow />

    <div class="row">
      <div class="row-text">
        <label class="row-title" for="fs-ai">AI spam check</label>
        <p class="row-desc">Reads submissions that pass the other checks and catches spam by its wording.</p>
      </div>
      <div class="row-control switchrow">
        <input id="fs-ai" v-model="draft.aiSpamScoring" type="checkbox" class="switch" />
        <span>{{ draft.aiSpamScoring ? 'On' : 'Off' }}</span>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Phishing check <span class="tag tag-ok">Always on</span></p>
        <p class="row-desc">Submissions with fields like <code>password</code> or <code>card_number</code> are held, not delivered.</p>
      </div>
      <div class="row-control">
        <p v-if="fieldNames === null || !fieldNames.length" class="hint-line muted">Checked when the first submission arrives.</p>
        <p v-else-if="!riskyFields.length" class="hint-line"><span class="tag tag-ok">All clear</span> No risky fields in recent submissions.</p>
        <p v-else class="hint-line"><span class="tag tag-signal">Held</span> Risky fields: <span class="mono">{{ riskyFields.join(', ') }}</span></p>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Always on</p>
      </div>
      <div class="row-control">
        <ul class="facts" role="list">
          <li>Rate limit: {{ limits.ratePerIpPerMinute }}/min per visitor, {{ limits.ratePerFormPerMinute }}/min per form</li>
          <li>Checks for spammy links, phrases and throwaway email addresses</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped src="./settings-panel.css"></style>
<style scoped src="./secret-input.css"></style>
<style scoped>
.switchrow {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}
.facts {
  display: grid;
  gap: var(--s-1);
  color: var(--fg-muted);
}
</style>
