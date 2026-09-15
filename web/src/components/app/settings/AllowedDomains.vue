<script setup lang="ts">
import { nextTick } from 'vue';
import Icon from '../../ui/Icon.vue';
import { normaliseDomain } from '../SettingsChannelRules';
import { domainError } from './settingsDraft';
import { useFormSettings } from './useFormSettings';

const { draft, errors, newDomain } = useFormSettings();

function addDomain() {
  const d = normaliseDomain(newDomain.value);
  errors.domain = domainError(d, draft.allowedOrigins);
  if (errors.domain) return nextTick(() => document.getElementById('fs-domain')?.focus());
  draft.allowedOrigins.push(d);
  newDomain.value = '';
}

function removeDomain(d: string) {
  const i = draft.allowedOrigins.indexOf(d);
  if (i >= 0) draft.allowedOrigins.splice(i, 1);
  nextTick(() => {
    const chips = document.querySelectorAll<HTMLButtonElement>('.chip-x');
    (chips[Math.min(i, chips.length - 1)] ?? document.getElementById('fs-domain'))?.focus();
  });
}
</script>

<template>
  <div class="row">
    <div class="row-text">
      <p id="fs-domains-label" class="row-title">Allowed domains</p>
      <p class="row-desc">Only forms on these sites can post here. Use <code>*.example.com</code> for subdomains. Leave it empty and any site can use your endpoint.</p>
    </div>
    <div class="row-control">
      <ul v-if="draft.allowedOrigins.length" class="chips" role="list" aria-labelledby="fs-domains-label">
        <li v-for="d in draft.allowedOrigins" :key="d" class="chip">
          <span class="mono">{{ d }}</span>
          <button type="button" class="chip-x" :aria-label="`Remove ${d}`" @click="removeDomain(d)"><Icon name="x" :size="14" /></button>
        </li>
      </ul>
      <p v-else class="notice notice-warn chips-empty">
        <span class="notice-icon"><Icon name="alert" :size="18" /></span>
        <span class="notice-body">No domains yet, so any website can post to this form. Fine for testing, less fine for real life.</span>
      </p>
      <form class="addrow" novalidate @submit.prevent="addDomain">
        <label class="sr-only" for="fs-domain">Add a domain</label>
        <input
          id="fs-domain"
          v-model="newDomain"
          class="input mono"
          placeholder="example.com"
          autocomplete="off"
          spellcheck="false"
          :aria-invalid="errors.domain ? 'true' : undefined"
          :aria-describedby="errors.domain ? 'fs-domain-err' : undefined"
        />
        <button type="submit" class="btn btn-outline"><Icon name="plus" /> Add</button>
      </form>
      <p v-if="errors.domain" id="fs-domain-err" class="field-error"><Icon name="alert" :size="14" /> {{ errors.domain }}</p>
    </div>
  </div>
</template>

<style scoped src="./settings-panel.css"></style>
<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.2rem 0.2rem 0.2rem 0.6rem;
  border: 1.5px solid var(--line-strong);
  border-radius: var(--r-1);
  background: var(--bg);
  font-size: var(--fs-sm);
}
.chip-x {
  display: grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  border: 0;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--fg-muted);
}
.chip-x:hover {
  background: var(--signal);
  color: var(--on-signal);
}
.chips-empty {
  grid-template-columns: auto 1fr;
}
.chips-empty .notice-body {
  grid-row: 1;
}
.addrow {
  display: flex;
  gap: var(--s-2);
}
.addrow .input {
  flex: 1;
  min-width: 0;
}
</style>
