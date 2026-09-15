import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue';
import type { EmailSettingsDto } from '@sendm8/shared';
import { api } from '../../../lib/api/endpoints';
import { joinFrom, splitFrom } from '../../../lib/api/adapters';
import { fieldError, friendlyError } from '../../../lib/api/errors';
import { toast } from '../../../lib/toast';
import { checkFrom, checkLocalPart } from './resendRules';

/**
 * The saved key's from address: a local part @ one of the verified Resend domains, or free
 * text when the domains can't be listed (sending-only keys, errors, none verified yet).
 */
export function useSenderPicker(settings: Ref<EmailSettingsDto | null>, byok: ComputedRef<EmailSettingsDto['byok'] | null>) {
  const domains = ref<string[]>([]);
  const domainsLoading = ref(false);
  const domainsRestricted = ref(false);
  const domainsError = ref('');
  const fromName = ref('');
  const localPart = ref('');
  const fromDomain = ref('');
  const fromFree = ref('');
  const fromSaveError = ref('');
  const savingFrom = ref(false);

  function resetFromFields() {
    const parts = splitFrom(byok.value?.from);
    fromName.value = parts.name;
    localPart.value = parts.local || 'forms';
    fromDomain.value = domains.value.includes(parts.domain) ? parts.domain : (domains.value[0] ?? parts.domain);
    fromFree.value = byok.value?.from ?? '';
  }

  async function loadDomains() {
    domainsLoading.value = true;
    domainsError.value = '';
    try {
      const result = await api.resendDomains();
      domains.value = result.domains;
      domainsRestricted.value = result.restricted;
    } catch (err) {
      domains.value = [];
      domainsError.value = friendlyError(err);
    } finally {
      domainsLoading.value = false;
      resetFromFields();
    }
  }

  const usePicker = computed(() => domains.value.length > 0 && !domainsRestricted.value);
  const nextFrom = computed(() =>
    usePicker.value ? (localPart.value.trim() ? joinFrom({ name: fromName.value, local: localPart.value, domain: fromDomain.value }) : '') : fromFree.value.trim(),
  );

  async function saveFrom() {
    if (savingFrom.value) return;
    fromSaveError.value = usePicker.value ? checkLocalPart(localPart.value) : checkFrom(fromFree.value.trim());
    if (fromSaveError.value) return nextTick(() => document.getElementById(usePicker.value ? 'rk-local' : 'rk-from-free')?.focus());
    savingFrom.value = true;
    try {
      const result = await api.patchResendFrom(nextFrom.value);
      if (settings.value) settings.value = { ...settings.value, byok: { ...settings.value.byok, from: result.from, healthy: true, error: null } };
      resetFromFields();
      toast(`From address saved: ${result.from}`);
    } catch (err) {
      fromSaveError.value = fieldError(err).message;
    } finally {
      savingFrom.value = false;
    }
  }

  return { domains, domainsLoading, domainsRestricted, domainsError, fromName, localPart, fromDomain, fromFree, fromSaveError, savingFrom, loadDomains, nextFrom, saveFrom };
}
