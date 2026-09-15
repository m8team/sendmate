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
  <OnboardingStep :n="3" heading="Grab the snippet" :action="open" @action="go(3)">
    <div v-if="step === 3" class="step-body">
      <p class="step-intro">Your endpoint is live. Paste it into any form’s <code>action</code> and you’re done.</p>

      <div class="endpoint ob-endpoint">
        <span class="endpoint-url"><span class="ep-base">{{ endpointBase }}</span><span class="ep-id">{{ formId }}</span></span>
        <button type="button" class="btn btn-sm copy-btn" :data-copy="endpoint" data-copy-toast="Endpoint copied">
          <span class="copy-idle"><Icon name="copy" :size="16" /><span>Copy</span></span>
          <span class="copy-done" aria-hidden="true"><Icon name="check" :size="16" /><span>Copied</span></span>
        </button>
      </div>

      <div v-if="webhookSecret" class="notice notice-accent ob-secret" role="note">
        <span class="notice-icon"><Icon name="key" :size="18" /></span>
        <p class="notice-title">Your webhook signing secret. Copy it now.</p>
        <div class="notice-body">
          <p>We only show it once. If you lose it, rotate it in the form’s settings.</p>
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
          <h3 class="h4">Try it before you ship it</h3>
          <p class="muted">We’ll post a real test submission through your endpoint, so it goes to every destination you picked.</p>
        </div>
        <button
          v-if="test !== 'delivered'"
          type="button"
          class="btn btn-outline"
          :aria-disabled="test === 'sending' ? 'true' : undefined"
          @click="sendTest"
        >
          <Icon name="send" /> {{ test === 'sending' ? 'In transit…' : test === 'failed' ? 'Try the test again' : 'Send a test submission' }}
        </button>
        <a v-else class="btn btn-signal" :href="inboxHref">Go to your inbox <Icon name="arrow-right" /></a>
      </div>
      <p class="ob-test-status mono" role="status" aria-live="polite">{{ testNote }}</p>
    </div>
  </OnboardingStep>
</template>

<style scoped>
.ob-endpoint .copy-btn {
  --btn-bg: var(--fg);
  --btn-fg: var(--bg);
}
.ob-code pre {
  white-space: pre;
}
.ob-url {
  background: color-mix(in srgb, var(--accent) 55%, transparent);
  color: var(--fg);
  padding: 0 0.1em;
  font-weight: 600;
}
.ob-test {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  flex-wrap: wrap;
  margin-top: var(--s-2);
  padding: var(--s-4);
  border: 2px dashed var(--line-strong);
}
.ob-test-text p {
  margin-top: 0.2rem;
  font-size: var(--fs-sm);
  max-width: 44ch;
}
.ob-test-status {
  min-height: 1.2em;
  font-size: var(--fs-xs);
  color: var(--ok);
}
.ob-secret {
  margin-block: var(--s-4);
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
