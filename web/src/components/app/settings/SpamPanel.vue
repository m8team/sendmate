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
      <p class="muted">Layers, cheapest first. Spam is still stored so you can fish out anything we got wrong, it just never gets delivered.</p>
    </header>

    <div class="row">
      <div class="row-text">
        <label class="row-title" for="fs-honeypot">Honeypot field</label>
        <p class="row-desc">A hidden field people never see. Bots fill in everything, so if it has a value, it’s spam. <code>_gotcha</code> always works; add your own name if you like.</p>
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
              : 'Optional. Leave it empty to use only the built-in _gotcha and _honeypot.'
          }}
        </p>
        <div class="codeblock codeblock-compact">
          <div class="cb-head">
            <span class="label cb-name">Add to your form</span>
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
        <label class="row-title" for="fs-ai">AI spam scoring <span class="tag tag-plain">Optional</span></label>
        <p class="row-desc">
          A second opinion on the wording for submissions that got past the other checks. Anything it’s sure about goes to spam before it’s delivered. It’s best-effort: if the AI
          is busy or unavailable (some self-hosted setups don’t have it), submissions just carry on as normal.
        </p>
      </div>
      <div class="row-control switchrow">
        <input id="fs-ai" v-model="draft.aiSpamScoring" type="checkbox" class="switch" />
        <span class="mono">{{ draft.aiSpamScoring ? 'On' : 'Off' }}</span>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Phishing guard <span class="tag tag-ok">Always on</span></p>
        <p class="row-desc">
          Forms with fields like <code>password</code>, <code>card_number</code>, <code>cvv</code> or <code>seed_phrase</code> get held, not delivered, until they’re
          reviewed. Nobody gets to use sendm8 to collect stolen logins.
        </p>
      </div>
      <div class="row-control">
        <p v-if="fieldNames === null" class="hint-line"><span class="tag tag-plain">Waiting</span> We’ll check your field names once the first submission arrives.</p>
        <p v-else-if="!fieldNames.length" class="hint-line"><span class="tag tag-plain">Nothing yet</span> No submissions to check yet.</p>
        <p v-else-if="!riskyFields.length" class="hint-line">
          <span class="tag tag-ok">All clear</span> Checked your recent fields: <span class="mono">{{ fieldNames.join(', ') }}</span>.
        </p>
        <p v-else class="hint-line">
          <span class="tag tag-signal">Held</span> These look risky: <span class="mono">{{ riskyFields.join(', ') }}</span>. Submissions with them wait for review.
        </p>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Always running</p>
        <p class="row-desc">You don’t have to do anything for these.</p>
      </div>
      <div class="row-control">
        <ul class="facts" role="list">
          <li><Icon name="clock" :size="16" /> Rate limit: {{ limits.ratePerIpPerMinute }} per minute per visitor, {{ limits.ratePerFormPerMinute }} per minute per form</li>
          <li><Icon name="filter" :size="16" /> Heuristics: link count, disposable email domains, known spam phrases</li>
          <li><Icon name="trash" :size="16" /> Spam is kept for {{ limits.spamRetentionDays }} days, then deleted for good</li>
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
  gap: var(--s-2);
  font-size: var(--fs-sm);
}
.facts li {
  display: grid;
  grid-template-columns: 1.4rem 1fr;
  align-items: start;
}
.facts :deep(svg) {
  margin-top: 0.2rem;
  color: var(--fg-muted);
}
</style>
