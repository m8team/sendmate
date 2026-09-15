/**
 * Shared state for one form's settings page. FormSettings.vue creates it and the tab panels
 * inject it, so the draft, the channel list and the email budget stay in step across tabs.
 */
import { computed, inject, onBeforeUnmount, onMounted, provide, ref, type InjectionKey } from 'vue';
import type { EmailAddressDto, EmailSettingsDto } from '@sendm8/shared';
import { api } from '../../../lib/api/endpoints';
import { fieldNamesFrom } from '../../../lib/api/adapters';
import { loadEmailSettings } from '../../../lib/api/index';
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

  async function loadExtras() {
    const [settings, emails, recent] = await Promise.allSettled([
      loadEmailSettings(),
      api.listEmails(),
      api.listSubmissions(draft.current.value.id, { filter: 'all', limit: 25 }),
    ]);
    if (settings.status === 'fulfilled') {
      emailSettings.value = settings.value;
      budget.used.value = settings.value.usage.instantToday;
    }
    if (emails.status === 'fulfilled') addresses.value = emails.value;
    addressesLoaded.value = true;
    fieldNames.value = recent.status === 'fulfilled' ? fieldNamesFrom(recent.value.data.filter((s) => s.status !== 'held')) : null;
  }

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (draft.dirty.value && !deleted.value) e.preventDefault();
  }

  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload);
    loadExtras();
  });
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

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
