<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import { useEmailAccount } from './useEmailAccount';

/** "Send notifications from": a local part @ a verified Resend domain, or a typed address. */
defineProps<{ savedFrom: string | null }>();

const { senderName, fromPlaceholder, sender } = useEmailAccount();
const { domains, domainsLoading, domainsRestricted, domainsError, fromName, localPart, fromDomain, fromFree, fromSaveError, savingFrom, nextFrom, saveFrom } = sender;
</script>

<template>
  <form class="fromform" novalidate @submit.prevent="saveFrom">
    <fieldset class="from">
      <legend class="field-label">Send notifications from</legend>
      <p v-if="domainsLoading" class="skel" style="height: 2.75rem" aria-hidden="true"></p>
      <template v-else-if="domains.length && !domainsRestricted">
        <label class="sr-only" for="rk-from-name">Sender name</label>
        <input id="rk-from-name" v-model="fromName" class="input from-name" autocomplete="off" :placeholder="senderName" />
        <div class="from-row">
          <label class="sr-only" for="rk-local">Name before the @</label>
          <input
            id="rk-local"
            v-model="localPart"
            class="input mono from-local"
            autocomplete="off"
            spellcheck="false"
            :aria-invalid="fromSaveError ? 'true' : undefined"
            :aria-describedby="fromSaveError ? 'rk-local-err rk-from-hint2' : 'rk-from-hint2'"
          />
          <span class="from-at mono" aria-hidden="true">@</span>
          <label class="sr-only" for="rk-domain">Verified domain</label>
          <select id="rk-domain" v-model="fromDomain" class="select mono from-domain" aria-describedby="rk-from-hint2">
            <option v-for="d in domains" :key="d" :value="d">{{ d }}</option>
          </select>
        </div>
      </template>
      <template v-else>
        <label class="sr-only" for="rk-from-free">From address</label>
        <input
          id="rk-from-free"
          v-model="fromFree"
          class="input mono"
          autocomplete="off"
          spellcheck="false"
          :placeholder="fromPlaceholder"
          :aria-invalid="fromSaveError ? 'true' : undefined"
          :aria-describedby="fromSaveError ? 'rk-local-err rk-from-hint2' : 'rk-from-hint2'"
        />
      </template>
      <p v-if="fromSaveError" id="rk-local-err" class="field-error"><Icon name="alert" :size="14" /> {{ fromSaveError }}</p>
      <p id="rk-from-hint2" class="field-hint">
        <template v-if="domainsRestricted">That’s a sending-only key, so we can’t list your domains. Type an address on a domain you’ve verified in Resend.</template>
        <template v-else-if="domainsError">{{ domainsError }} Type the address instead.</template>
        <template v-else-if="domains.length">Only domains you’ve verified in Resend show up here.</template>
        <template v-else>No verified domains found in Resend yet. Type an address on a domain you’ve verified.</template>
        Inboxes will say <b>{{ nextFrom || fromPlaceholder }}</b>.
      </p>
    </fieldset>
    <div class="from-actions">
      <span v-if="nextFrom === savedFrom" class="tag tag-ok">Saved</span>
      <button type="submit" class="btn btn-outline btn-sm" :disabled="nextFrom === savedFrom" :aria-disabled="savingFrom ? 'true' : undefined">
        {{ savingFrom ? 'Checking with Resend…' : 'Save from address' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.fromform {
  display: grid;
  gap: var(--s-3);
}
.from {
  display: grid;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.from legend {
  margin-bottom: var(--s-2);
}
.from-row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-width: 0;
}
.from-local {
  flex: 0 1 11rem;
  min-width: 0;
}
.from-at {
  font-size: 1.1rem;
  color: var(--fg-muted);
}
.from-domain {
  flex: 1;
  min-width: 0;
}
.from-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--s-3);
}
@media (max-width: 560px) {
  .from-row {
    flex-wrap: wrap;
  }
  .from-local {
    flex: 1 1 8rem;
  }
  .from-domain {
    flex-basis: 100%;
  }
}
</style>
