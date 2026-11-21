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
      <p class="muted">Email only. Other channels are always instant.</p>
    </header>

    <div class="row">
      <div class="row-text">
        <p id="fs-notify-title" class="row-title">Email me</p>
        <p v-if="emailChannels.length" class="row-desc">
          To {{ emailChannels.map((c) => c.label).join(', ') }} ·
          <button type="button" class="linkish" @click="selectTab('channels', true)">Change</button>
        </p>
      </div>
      <div v-if="!emailChannels.length" class="row-control">
        <p class="muted">No email address is set up for this form.</p>
        <p><button type="button" class="btn btn-outline btn-sm" @click="selectTab('channels', true)">Add an email address</button></p>
      </div>
      <div v-else class="row-control options" role="radiogroup" aria-labelledby="fs-notify-title">
        <label class="option" :class="{ on: draft.notify === 'instant' }">
          <input v-model="draft.notify" type="radio" class="check" name="fs-notify" value="instant" />
          <span class="option-body">
            <span class="option-title"><Icon name="zap" :size="16" /> Every submission</span>
            <span class="option-desc">One email per submission. Counts towards your daily limit.</span>
          </span>
        </label>
        <label class="option" :class="{ on: draft.notify === 'digest' }">
          <input v-model="draft.notify" type="radio" class="check" name="fs-notify" value="digest" />
          <span class="option-body">
            <span class="option-title"><Icon name="inbox" :size="16" /> Daily digest</span>
            <span class="option-desc">One summary email a day at {{ digestAt }}.</span>
          </span>
        </label>
        <label class="option" :class="{ on: draft.notify === 'off' }">
          <input v-model="draft.notify" type="radio" class="check" name="fs-notify" value="off" />
          <span class="option-body">
            <span class="option-title"><Icon name="minus" :size="16" /> No emails</span>
            <span class="option-desc">Submissions still arrive in your inbox and other channels.</span>
          </span>
        </label>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Daily email limit</p>
        <p class="row-desc">Shared by all your forms. Over the limit, emails wait for the {{ digestAt }} digest.</p>
      </div>
      <EmailBudget />
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Reply-To</p>
        <p class="row-desc">Replying to a notification emails the person who submitted.</p>
      </div>
      <div class="row-control">
        <p v-if="fieldNames === null || !fieldNames.length" class="hint-line">
          Add a field named <code>email</code> or <code>_replyto</code>.
        </p>
        <p v-else-if="hasReplyField" class="hint-line"><span class="tag tag-ok">Ready</span> Using your <code>email</code> field.</p>
        <p v-else class="hint-line"><span class="tag tag-warn">No email field</span> Add a field named <code>email</code> or <code>_replyto</code>.</p>
      </div>
    </div>

    <div class="row">
      <div class="row-text">
        <p class="row-title">Subject line</p>
        <p class="row-desc">Default: “New submission: {{ savedName }}”. Set your own with a hidden <code>_subject</code> field.</p>
      </div>
      <div class="row-control">
        <div class="codeblock codeblock-compact">
          <div class="cb-head">
            <span class="label cb-name">HTML</span>
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
