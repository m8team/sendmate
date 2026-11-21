<script setup lang="ts">
/** One line above the inbox: the form's name, its status when it isn't plain active, its endpoints and this month's count. */
import { computed } from 'vue';
import Icon from '../../ui/Icon.vue';
import type { Form } from '../../../lib/api/types';
import { emailAddressOf, formStatusTag } from './formStatus';

const props = defineProps<{ form: Form; formStatus: Form['status'] }>();

const statusMeta = computed(() => formStatusTag(props.formStatus));
const confirmAddress = computed(() => emailAddressOf(props.form.emailEndpoint) ?? 'the address');
</script>

<template>
  <header class="ih">
    <div class="ih-titlerow">
      <h1 class="ih-title">{{ form.name }}</h1>
      <span v-if="formStatus !== 'active'" class="tag" :class="statusMeta.cls">{{ statusMeta.text }}</span>
    </div>
    <div class="ih-endpoints">
      <div class="endpoint ih-endpoint">
        <span class="endpoint-url" tabindex="0" :aria-label="`Endpoint ${form.endpoint}`">
          <span class="ep-base">{{ form.endpointBase }}</span><span class="ep-id">{{ form.id }}</span>
        </span>
        <button type="button" class="btn btn-ghost btn-xs copy-btn copy-icon-only" :data-copy="form.endpoint" data-copy-toast="Endpoint copied" aria-label="Copy endpoint">
          <span class="copy-idle"><Icon name="copy" :size="14" /></span>
          <span class="copy-done" aria-hidden="true"><Icon name="check" :size="14" /></span>
        </button>
      </div>
      <div v-if="form.emailEndpoint" class="endpoint ih-endpoint">
        <span class="endpoint-url" tabindex="0" :aria-label="`Email endpoint ${form.emailEndpoint}`">
          <span class="ep-base">{{ form.endpointBase }}</span><span class="ep-id">{{ confirmAddress }}</span>
        </span>
        <button type="button" class="btn btn-ghost btn-xs copy-btn copy-icon-only" :data-copy="form.emailEndpoint" data-copy-toast="Email endpoint copied" aria-label="Copy email endpoint">
          <span class="copy-idle"><Icon name="copy" :size="14" /></span>
          <span class="copy-done" aria-hidden="true"><Icon name="check" :size="14" /></span>
        </button>
      </div>
    </div>
    <p class="ih-month tabular" :class="{ 'is-high': form.monthCount > form.monthlyLimit * 0.8 }">
      {{ form.monthCount.toLocaleString('en-GB') }} of {{ form.monthlyLimit.toLocaleString('en-GB') }} this month
    </p>
  </header>
</template>

<style scoped>
.ih {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2) var(--s-4);
  padding: var(--s-3) clamp(1rem, 2.5vw, 1.5rem);
  border-bottom: 1px solid var(--line);
}
.ih-titlerow {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
}
.ih-title {
  font-size: 1.125rem;
  font-weight: 650;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.ih-endpoints {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  min-width: 0;
}
.ih-endpoint {
  max-width: 24rem;
}
.ih-month {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--fg-muted);
  white-space: nowrap;
}
.ih-month.is-high {
  color: var(--signal-text);
  font-weight: 600;
}

@media (max-width: 720px) {
  .ih {
    gap: var(--s-2);
  }
  /* Phones are for reading post; the endpoint is a tap away in Settings. */
  .ih-endpoints {
    display: none;
  }
}
</style>
