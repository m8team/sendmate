<script setup lang="ts">
/** Where a submission came from: country, browser, referrer, a note on IPs, and its id. */
import type { Submission } from '../../../lib/api/types';

defineProps<{ s: Submission }>();
</script>

<template>
  <dl class="meta">
    <div>
      <dt class="label">Country</dt>
      <dd v-if="s.meta.country"><span class="mono meta-cc">{{ s.meta.country }}</span> {{ s.meta.countryName }}</dd>
      <dd v-else class="muted">Unknown</dd>
    </div>
    <div>
      <dt class="label">Browser</dt>
      <dd :title="s.meta.userAgent ?? undefined">{{ s.meta.browser ?? 'Unknown' }}</dd>
    </div>
    <div><dt class="label">Referrer</dt><dd class="mono">{{ s.meta.referrer ?? '(direct)' }}</dd></div>
    <div>
      <dt class="label">IP address</dt>
      <dd class="mono">Hashed<span class="meta-why"> · we never store the raw address</span></dd>
    </div>
    <div><dt class="label">ID</dt><dd class="mono meta-id">{{ s.id }}</dd></div>
  </dl>
</template>

<style scoped>
.meta {
  display: grid;
  border-top: var(--bw-strong) solid var(--line-strong);
}
.meta > div {
  display: grid;
  grid-template-columns: 7rem minmax(0, 1fr);
  gap: var(--s-3);
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--line);
  align-items: baseline;
}
.meta dt {
  color: var(--fg-muted);
}
.meta dd {
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.meta dd.mono {
  font-size: var(--fs-xs);
}
.meta-cc {
  display: inline-block;
  padding: 0 0.3rem;
  border: 1px solid var(--line-strong);
  font-size: var(--fs-2xs);
  margin-right: 0.2rem;
}
.meta-why {
  font-family: var(--font-text);
  color: var(--fg-muted);
}
</style>
