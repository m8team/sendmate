<script setup lang="ts">
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import OnboardingStep from './OnboardingStep.vue';
import { useOnboarding } from './useOnboarding';

const { step, reached, go, formId, endpoint, endpointBase, webhookSecret, tabs, tabIndex, activeTab, codeParts, onTabKey, test, testNote, sendTest, inboxHref } =
  useOnboarding();

const open = computed(() => (step.value !== 3 && reached.value >= 3 ? { label: 'Open', srLabel: 'snippet' } : undefined));
</script>

<template>
  <OnboardingStep :n="3" heading="Add it to your site" :action="open" @action="go(3)">
    <div v-if="step === 3" class="step-body">
      <p class="step-intro">Your endpoint is live. Use it as your form’s <code>action</code>.</p>

      <div class="endpoint ob-endpoint">
        <span class="endpoint-url"><span class="ep-base">{{ endpointBase }}</span><span class="ep-id">{{ formId }}</span></span>
        <button type="button" class="btn btn-ghost btn-sm copy-btn" :data-copy="endpoint" data-copy-toast="Endpoint copied">
          <span class="copy-idle"><Icon name="copy" :size="16" /><span>Copy</span></span>
          <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /><span>Copied</span></span>
        </button>
      </div>

      <div v-if="webhookSecret" class="notice notice-accent ob-secret" role="note">
        <span class="notice-icon"><Icon name="key" :size="18" /></span>
        <p class="notice-title">Copy your webhook signing secret now</p>
        <div class="notice-body">
          <p>It’s only shown once. You can rotate it in the form’s settings.</p>
          <p class="ob-secret-row">
            <code class="mono">{{ webhookSecret }}</code>
            <button type="button" class="btn btn-outline btn-xs copy-btn" :data-copy="webhookSecret" data-copy-toast="Signing secret copied">
              <span class="copy-idle"><Icon name="copy" :size="14" /><span>Copy</span></span>
              <span class="copy-done" aria-hidden="true"><Icon name="check" :size="14" /><span>Copied</span></span>
            </button>
          </p>
        </div>
      </div>

      <div class="codeblock ob-code">
        <div class="cb-head cb-head-tabs">
          <div class="cb-tablist" role="tablist" aria-label="Framework">
            <button
              v-for="(t, i) in tabs"
              :id="`ob-tab-${i}`"
              :key="t.label"
              type="button"
              role="tab"
              class="cb-tab"
              :aria-selected="tabIndex === i"
              :aria-controls="`ob-panel`"
              :tabindex="tabIndex === i ? 0 : -1"
              @click="tabIndex = i"
              @keydown="onTabKey"
            >
              {{ t.label }}
            </button>
          </div>
          <button type="button" class="btn btn-outline btn-xs copy-btn" :data-copy="activeTab.code" data-copy-toast="Snippet copied">
            <span class="copy-idle"><Icon name="copy" :size="14" /><span>Copy</span></span>
            <span class="copy-done" aria-hidden="true"><Icon name="check" :size="14" /><span>Copied</span></span>
          </button>
        </div>
        <div id="ob-panel" class="cb-panel" role="tabpanel" :aria-labelledby="`ob-tab-${tabIndex}`" tabindex="0">
          <p class="cb-file label">{{ activeTab.filename }}</p>
          <div class="cb-body">
            <pre><code>{{ codeParts.before }}<mark class="ob-url">{{ codeParts.url }}</mark>{{ codeParts.after }}</code></pre>
          </div>
        </div>
      </div>

      <div class="ob-test">
        <div class="ob-test-text">
          <h3 class="h4">Send a test</h3>
          <p class="muted">Posts a real submission to every destination you picked.</p>
        </div>
        <button
          v-if="test !== 'delivered'"
          type="button"
          class="btn btn-outline"
          :aria-disabled="test === 'sending' ? 'true' : undefined"
          @click="sendTest"
        >
          <Icon name="send" /> {{ test === 'sending' ? 'Sending…' : test === 'failed' ? 'Try again' : 'Send test' }}
        </button>
        <a v-else class="btn btn-signal" :href="inboxHref">Go to your inbox <Icon name="arrow-right" /></a>
      </div>
      <p class="ob-test-status" role="status" aria-live="polite">{{ testNote }}</p>
    </div>
  </OnboardingStep>
</template>

<style scoped>
.ob-code pre {
  white-space: pre;
}
.ob-url {
  background: color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--fg);
  padding: 0 0.1em;
}
.ob-test {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  flex-wrap: wrap;
  padding-top: var(--s-4);
  border-top: 1px solid var(--line);
}
.ob-test-text p {
  font-size: var(--fs-xs);
}
.ob-test-status {
  min-height: 1.2em;
  font-size: var(--fs-xs);
  color: var(--ok);
}
.ob-secret-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
}
.ob-secret-row code {
  overflow-wrap: anywhere;
  font-size: var(--fs-xs);
}

@media (max-width: 560px) {
  .ob-test .btn {
    width: 100%;
  }
}
</style>
