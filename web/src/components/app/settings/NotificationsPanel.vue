<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import EmailBudget from './EmailBudget.vue';
import { hasReplyToField, subjectSnippet } from './settingsHelpers';
import { useFormSettings } from './useFormSettings';

const { draft, savedName, fieldNames, chans, budget, selectTab } = useFormSettings();
const { digestAt } = budget;

const hasReplyField = computed(() => hasReplyToField(fieldNames.value));
const emailChannels = computed(() => chans.filter((c) => c.type === 'email'));
const snippet = computed(() => subjectSnippet(savedName.value));
</script>

<template>
  <section id="fs-panel-notifications" role="tabpanel" aria-labelledby="fs-tab-notifications" tabindex="0" class="panel">
    <header class="panel-head">
      <h2 class="h3">Notifications</h2>
      <p class="muted">How often we email you about this form. Discord, Slack, Telegram and webhooks always go out instantly.</p>
    </header>

    <div class="row">
      <div class="row-text">
        <p id="fs-notify-title" class="row-title">Email me</p>
        <p class="row-desc">
          Going to
          <b class="mono">{{ emailChannels.length ? emailChannels.map((c) => c.label).join(', ') : 'nobody yet' }}</b>.
          <button type="button" class="linkish" @click="selectTab('channels', true)">Change in Channels</button>
        </p>
      </div>
      <div class="row-control options" role="radiogroup" aria-labelledby="fs-notify-title">
        <label class="option" :class="{ on: draft.notify === 'instant' }">
          <input v-model="draft.notify" type="radio" class="check" name="fs-notify" value="instant" />
          <span class="option-body">
            <span class="option-title"><Icon name="zap" :size="16" /> Every submission</span>
            <span class="option-desc">One email as each one lands. Counts towards your daily email budget.</span>
          </span>
        </label>
        <label class="option" :class="{ on: draft.notify === 'digest' }">
          <input v-model="draft.notify" type="radio" class="check" name="fs-notify" value="digest" />
          <span class="option-body">
            <span class="option-title"><Icon name="inbox" :size="16" /> Daily digest</span>
            <span class="option-desc">One round-up at {{ digestAt }} with everything from the last 24 hours. Quiet, and costs one email.</span>
          </span>
        </label>
        <label class="option" :class="{ on: draft.notify === 'off' }">
          <input v-model="draft.notify" type="radio" class="check" name="fs-notify" value="off" />
          <span class="option-body">
            <span class="option-title"><Icon name="minus" :size="16" /> No emails</span>
            <span class="option-desc">Submissions still land in your inbox and go to your other channels. Email stays quiet.</span>
          </span>
        </label>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Instant email budget</p>
        <p class="row-desc">
          Shared by all your forms, resets at 00:00 UTC. Go over and nothing is dropped: the extras wait for the digest at {{ digestAt }}.
        </p>
      </div>
      <EmailBudget />
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Reply-To</p>
        <p class="row-desc">Hit reply on a notification and it goes straight to the person who filled in the form.</p>
      </div>
      <div class="row-control">
        <p v-if="fieldNames === null || !fieldNames.length" class="hint-line">
          <span class="tag tag-plain">Not sure yet</span> Add a field called <code>email</code> (or a hidden <code>_replyto</code>) and replies go to the sender.
        </p>
        <p v-else-if="hasReplyField" class="hint-line"><span class="tag tag-ok">Ready</span> Your form has an <code>email</code> field, so we use that as the Reply-To.</p>
        <p v-else class="hint-line"><span class="tag tag-warn">No email field</span> Add a field called <code>email</code> or <code>_replyto</code> and replies will go to the sender.</p>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Subject line</p>
        <p class="row-desc">By default it’s “New submission: {{ savedName }}”. Want your own? Add a hidden <code>_subject</code> field.</p>
      </div>
      <div class="row-control">
        <div class="codeblock codeblock-compact">
          <div class="cb-head">
            <span class="label cb-name">Paste into your form</span>
            <button type="button" class="btn btn-ghost btn-xs copy-btn" :data-copy="snippet" data-copy-toast="Snippet copied">
              <span class="copy-idle"><Icon name="copy" :size="14" /><span>Copy</span></span>
              <span class="copy-done" aria-hidden="true"><Icon name="check" :size="14" /><span>Copied</span></span>
            </button>
          </div>
          <div class="cb-body"><pre><code>{{ snippet }}</code></pre></div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped src="./settings-panel.css"></style>
<style scoped src="./option-cards.css"></style>
<style scoped>
.linkish {
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal-text);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
</style>
