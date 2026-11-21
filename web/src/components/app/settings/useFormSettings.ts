/**
 * Shared state for one form's settings page. FormSettings.vue creates it and the tab panels
 * inject it, so the draft, the channel list and the email budget stay in step across tabs.
 */
import { computed, inject, onBeforeUnmount, onMounted, provide, ref, type InjectionKey } from 'vue';
import type { EmailAddressDto, EmailSettingsDto } from '@sendm8/shared';
import { api } from '../../../lib/api/endpoints';
import { fieldNamesFrom } from '../../../lib/api/adapters';
import { loadEmailSettings, loadEmails } from '../../../lib/api/store';
import type { Channel, Form } from '../../../lib/api/types';
import { useAddChannel } from './useAddChannel';
import { useChannels } from './useChannels';
import { useEmailBudget } from './useEmailBudget';
import { useSettingsDraft } from './useSettingsDraft';
import { useSettingsTabs } from './useSettingsTabs';

export interface SettingsLimits {
  digestHourUtc: number;
  spamRetentionDays: number;
  webhookTimeoutSeconds: number;
  ratePerIpPerMinute: number;
  ratePerFormPerMinute: number;
  maxDeliveryAttempts: number;
  instantEmailsPerDay: number;
}

export interface FormSettingsProps {
  form: Form;
  channels: Channel[];
  limits: SettingsLimits;
}

function createContext(props: FormSettingsProps, onFormUpdated: (form: Form) => void) {
  const limits = computed(() => props.limits);
  const tabs = useSettingsTabs();
  const draft = useSettingsDraft({ form: props.form, selectTab: tabs.selectTab, onSaved: onFormUpdated });

  /* Supporting data: email usage, addresses, field names */
  const emailSettings = ref<EmailSettingsDto | null>(null);
  const addresses = ref<EmailAddressDto[]>([]);
  const addressesLoaded = ref(false);
  const fieldNames = ref<string[] | null>(null);
  const budget = useEmailBudget(emailSettings, () => props.limits);

  const channels = useChannels(props.channels, { byok: budget.byok, used: budget.used });
  const addChannel = useAddChannel({
    formId: () => draft.current.value.id,
    addresses,
    onAdded: (c) => channels.chans.push(c),
  });

  /** Set once the form is deleted, so the save bar and the leave warning stand down. */
  const deleted = ref(false);

  /** Each piece fills in as soon as it arrives: cached ones at once, the field-name check when it lands. */
  function loadExtras() {
    loadEmailSettings()
      .then((settings) => {
        emailSettings.value = settings;
        budget.used.value = settings.usage.instantToday;
      })
      .catch(() => {});
    loadEmails()
      .then((emails) => (addresses.value = emails))
      .catch(() => {})
      .finally(() => (addressesLoaded.value = true));
    api
      .listSubmissions(draft.current.value.id, { filter: 'all', limit: 25 })
      .then((recent) => (fieldNames.value = fieldNamesFrom(recent.data.filter((s) => s.status !== 'held'))))
      .catch(() => (fieldNames.value = null));
  }

  const unsaved = () => draft.dirty.value && !deleted.value;

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (unsaved()) e.preventDefault();
  }

  /** Client-side navigation doesn't fire beforeunload, so ask before leaving with unsaved changes. */
  function onBeforeNavigate(e: Event) {
    if (unsaved() && !window.confirm('You have unsaved changes. Leave without saving?')) e.preventDefault();
  }

  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('astro:before-preparation', onBeforeNavigate);
    loadExtras();
  });
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    document.removeEventListener('astro:before-preparation', onBeforeNavigate);
  });

  return {
    onFormUpdated,
    limits,
    ...tabs,
    ...draft,
    emailSettings,
    addressesLoaded,
    fieldNames,
    budget,
    ...channels,
    addChannel,
    deleted,
    status: computed(() => draft.current.value.status),
    /** The address part of a zero-signup form's `/f/you@example.com` endpoint. */
    zeroSignupAddress: computed(() => draft.current.value.emailEndpoint?.split('/f/')[1] ?? null),
  };
}

export type FormSettingsContext = ReturnType<typeof createContext>;

const KEY: InjectionKey<FormSettingsContext> = Symbol('form-settings');

/** Creates the page's settings state and makes it available to the tab panels. */
export function provideFormSettings(props: FormSettingsProps, onFormUpdated: (form: Form) => void) {
  const ctx = createContext(props, onFormUpdated);
  provide(KEY, ctx);
  return ctx;
}

export function useFormSettings(): FormSettingsContext {
  const ctx = inject(KEY);
  if (!ctx) throw new Error('useFormSettings() needs a FormSettings ancestor');
  return ctx;
}
