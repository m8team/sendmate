import { computed, nextTick, reactive, ref, watch } from 'vue';
import { api } from '../../../lib/api/endpoints';
import { buildFormPatch, toForm, type SettingsDraft } from '../../../lib/api/adapters';
import { fieldError, friendlyError } from '../../../lib/api/errors';
import { announceFormsChanged } from '../../../lib/api/index';
import { toast } from '../../../lib/toast';
import type { Form } from '../../../lib/api/types';
import { validateRedirect } from '../SettingsChannelRules';
import {
  draftFromForm,
  errorField,
  errorKeyForApiField,
  errorKeys,
  errorTab,
  validateHoneypot,
  validateName,
  validateTurnstileSecret,
  type ErrorKey,
  type SettingsErrors,
} from './settingsDraft';
import type { TabId } from './settingsTabs';

interface DraftOptions {
  form: Form;
  selectTab: (id: TabId) => void;
  onSaved: (form: Form) => void;
}

/** The unsaved settings draft: dirty tracking, validation, and saving it back to the API. */
export function useSettingsDraft({ form, selectTab, onSaved }: DraftOptions) {
  const current = ref<Form>(form);
  const draft = reactive<SettingsDraft>(draftFromForm(form));
  const saved = ref<string>(JSON.stringify(draftFromForm(form)));
  const savedName = computed(() => current.value.name);
  const hasStoredSecret = computed(() => current.value.turnstileConfigured);
  const dirty = computed(() => JSON.stringify(draft) !== saved.value);
  const saving = ref(false);
  const errors = reactive<SettingsErrors>({});
  /** The "add a domain" input on the General tab. Discard clears it too. */
  const newDomain = ref('');

  const tabHasError = (id: TabId) => errorKeys.some((k) => errors[k] && errorTab[k] === id);

  function validateAll() {
    errors.name = validateName(draft.name);
    errors.redirect = validateRedirect(draft.redirectUrl, draft.allowedOrigins);
    errors.honeypot = validateHoneypot(draft.honeypotField);
    errors.secret = validateTurnstileSecret(draft.turnstile, draft.turnstileSecret, hasStoredSecret.value);
    errors.domain = undefined;
    return errorKeys.filter((k) => errors[k]);
  }

  async function focusError(key: ErrorKey) {
    selectTab(errorTab[key]);
    await nextTick();
    document.getElementById(errorField[key])?.focus();
  }

  /** Puts an API validation error next to the field it belongs to. */
  function placeApiError(err: unknown): ErrorKey | null {
    const { field, message } = fieldError(err);
    const key = errorKeyForApiField(field);
    if (key) errors[key] = message;
    return key;
  }

  function resetTo(f: Form) {
    current.value = f;
    Object.assign(draft, draftFromForm(f));
    saved.value = JSON.stringify(draftFromForm(f));
  }

  async function save() {
    if (saving.value) return;
    errors.general = undefined;
    const bad = validateAll();
    if (bad.length) {
      await focusError(bad[0]);
      toast('Not saved. Fix the highlighted field first.');
      return;
    }
    const { patch, turnstile } = buildFormPatch(current.value, draft);
    saving.value = true;
    try {
      if (turnstile?.action === 'put') {
        try {
          await api.setTurnstile(current.value.id, turnstile.secretKey);
        } catch (err) {
          errors.secret = friendlyError(err);
          await focusError('secret');
          return;
        }
      }
      if (patch) {
        try {
          await api.updateForm(current.value.id, patch);
        } catch (err) {
          const key = placeApiError(err);
          if (key) await focusError(key);
          else errors.general = friendlyError(err);
          toast(`Not saved: ${friendlyError(err)}`);
          return;
        }
      }
      if (turnstile?.action === 'delete') await api.deleteTurnstile(current.value.id);
      const fresh = toForm(await api.getForm(current.value.id), current.value.daily);
      resetTo(fresh);
      onSaved(fresh);
      if (patch?.name) announceFormsChanged();
      toast('Saved. Changes are live.');
    } catch (err) {
      errors.general = friendlyError(err);
      toast(`Not saved: ${friendlyError(err)}`);
    } finally {
      saving.value = false;
    }
  }

  function discard() {
    Object.assign(draft, JSON.parse(saved.value));
    errorKeys.forEach((k) => (errors[k] = undefined));
    errors.general = undefined;
    newDomain.value = '';
    toast('Changes discarded.');
  }

  // Re-check the redirect when domains change, so removing a domain flags a broken redirect straight away
  watch(
    () => [...draft.allowedOrigins],
    () => {
      if (draft.redirectUrl.trim()) errors.redirect = validateRedirect(draft.redirectUrl, draft.allowedOrigins);
    },
  );
  watch(
    () => draft.name,
    () => errors.name && (errors.name = undefined),
  );
  watch(
    () => draft.honeypotField,
    () => errors.honeypot && (errors.honeypot = undefined),
  );
  watch(
    () => [draft.turnstileSecret, draft.turnstile],
    () => errors.secret && (errors.secret = undefined),
  );

  return { current, draft, savedName, hasStoredSecret, dirty, saving, errors, newDomain, tabHasError, save, discard };
}
