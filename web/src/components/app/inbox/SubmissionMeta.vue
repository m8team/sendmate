<script setup lang="ts">
/** Where a submission came from: country, browser, referrer, a note on IPs, its reference and its id. */
import type { Submission } from '../../../lib/api/types';

defineProps<{ s: Submission }>();
</script>

<template>
  <dl class="meta">
    <div>
      <dt>Country</dt>
      <dd>{{ s.meta.countryName ?? 'Unknown' }}</dd>
    </div>
    <div>
      <dt>Browser</dt>
      <dd :title="s.meta.userAgent ?? undefined">{{ s.meta.browser ?? 'Unknown' }}</dd>
    </div>
    <div>
      <dt>Referrer</dt>
      <dd>{{ s.meta.referrer ?? 'None (direct)' }}</dd>
    </div>
    <div>
      <dt>IP address</dt>
      <dd>Not stored (hashed)</dd>
    </div>
    <div>
      <dt>Reference</dt>
      <dd class="mono">{{ s.tracking }}</dd>
    </div>
    <div>
      <dt>ID</dt>
      <dd class="mono">{{ s.id }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.meta {
  display: grid;
  gap: var(--s-2);
}
.meta > div {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr);
  gap: var(--s-4);
  align-items: baseline;
}
.meta dt {
  font-size: var(--fs-xs);
  color: var(--fg-muted);
}
.meta dd {
  overflow-wrap: anywhere;
}
.meta dd.mono {
  font-size: var(--fs-xs);
}
</style>
