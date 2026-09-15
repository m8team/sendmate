<script setup lang="ts">
import Icon from '../../ui/Icon.vue';
import DestinationCard from './DestinationCard.vue';
import { useOnboarding } from './useOnboarding';

const { emailOn, emailChoice, newEmail, newEmailError, addressesLoading, addressesError, verified, pending, loadAddresses } = useOnboarding();
</script>

<template>
  <DestinationCard v-model="emailOn" icon="mail" name="Email" sub="One email per submission" sub-id="ob-email-sub" body-tag="fieldset">
    <legend class="field-label">Send to</legend>
    <div class="pick" :aria-busy="addressesLoading ? 'true' : undefined">
      <div v-if="addressesLoading" class="pick-row is-disabled" aria-hidden="true">
        <span class="skel" style="width: 1.1rem; height: 1.1rem"></span>
        <span class="skel" style="width: 60%; height: 0.8rem"></span>
      </div>
      <p v-else-if="addressesError" class="pick-row field-error" role="alert">
        <Icon name="alert" :size="14" /> {{ addressesError }}
        <button type="button" class="btn btn-ghost btn-xs" @click="loadAddresses">Try again</button>
      </p>
      <label v-for="e in verified" :key="e.id" class="pick-row">
        <input v-model="emailChoice" type="radio" class="check" name="ob-email" :value="e.id" />
        <span class="pick-main mono">{{ e.email }}</span>
        <span class="tag tag-ok">Verified</span>
      </label>
      <label v-for="e in pending" :key="e.id" class="pick-row">
        <input v-model="emailChoice" type="radio" class="check" name="ob-email" :value="e.id" :aria-label="`${e.email}, waiting for verification`" />
        <span class="pick-main mono">{{ e.email }}</span>
        <span class="tag tag-warn">Not verified yet</span>
      </label>
      <label class="pick-row">
        <input v-model="emailChoice" type="radio" class="check" name="ob-email" value="__new" />
        <span class="pick-main">A different address</span>
      </label>
    </div>
    <div v-if="emailChoice === '__new'" class="field sub-field">
      <label class="field-label" for="ob-new-email">New address</label>
      <input
        id="ob-new-email"
        v-model="newEmail"
        class="input"
        type="email"
        autocomplete="email"
        placeholder="hello@yourdomain.com"
        :aria-invalid="newEmailError ? 'true' : undefined"
        :aria-describedby="newEmailError ? 'ob-new-email-err' : 'ob-new-email-hint'"
      />
      <p v-if="newEmailError" id="ob-new-email-err" class="field-error"><Icon name="alert" :size="14" /> {{ newEmailError }}</p>
      <p v-else id="ob-new-email-hint" class="field-hint">
        We’ll send a verification link to <b>{{ newEmail.trim() || 'that address' }}</b>. Submissions wait safely in your inbox until you click it.
      </p>
    </div>
  </DestinationCard>
</template>

<style scoped>
.pick {
  display: grid;
  gap: 0;
  border: 1px solid var(--line);
  background: var(--bg-raised);
}
.pick-row {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  min-width: 0;
  flex-wrap: wrap;
}
.pick-row:last-child {
  border-bottom: 0;
}
.pick-row:has(input:checked) {
  box-shadow: inset 4px 0 0 var(--signal);
}
.pick-row.is-disabled {
  cursor: not-allowed;
  color: var(--fg-muted);
}
.pick-row.is-disabled .check {
  opacity: 0.4;
  cursor: not-allowed;
}
.pick-main {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.sub-field {
  margin-top: var(--s-2);
}

@media (max-width: 560px) {
  .pick-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    row-gap: 0.3rem;
  }
  .pick-row .tag {
    grid-column: 2;
    justify-self: start;
  }
  .pick-main {
    overflow-wrap: normal;
    word-break: break-all;
  }
}
</style>
