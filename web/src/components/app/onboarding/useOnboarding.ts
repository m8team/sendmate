import { computed, inject, nextTick, onMounted, provide, reactive, ref, watch, type InjectionKey } from 'vue';
import type { EmailAddressDto, MeDto } from '@sendm8/shared';
import { setupTabs } from '../../../config/snippets';
import { api } from '../../../lib/api/endpoints';
import { isApiError } from '../../../lib/api/client';
import { endpointBase as baseOf, trackingNo } from '../../../lib/api/adapters';
import { errorCode, fieldError, friendlyError, splitValidation } from '../../../lib/api/errors';
import { guardSession } from '../../../lib/api/session';
import { announceFormsChanged } from '../../../lib/api/store';
import { channelMeta, emptyChannelDraft, validateChannel, type AddableChannel, type ChannelDraft, type ChannelErrors } from '../SettingsChannelRules';
import {
  channelInput,
  channelOrder,
  destinationsFor,
  draftField,
  nextTabIndex,
  splitAtEndpoint,
  stepState as stateOf,
  testSentNote,
  validateName,
  validateNewEmail,
  type Step,
} from './onboardingLogic';

/**
 * The onboarding flow's state: name the form (step 1), create its channels (step 2),
 * then show the snippet and send a real test submission (step 3).
 * `OnboardingFlow` creates it with `provideOnboarding()`; the steps and the label read it with `useOnboarding()`.
 */
function createOnboarding(bodyKb: number) {
  const step = ref<Step>(1);
  const reached = ref<Step>(1);
  const me = ref<MeDto | null>(null);
  /** Build-time fallback until /api/me brings the deployment's limit. */
  const maxWeightKb = computed(() => (me.value ? Math.round(me.value.limits.maxBodyBytes / 1024) : bodyKb));

  /* ---- Step 1 ---- */
  const name = ref('');
  const nameError = ref('');
  const formId = ref('');
  const formEndpoint = ref('');
  const savedName = ref('');
  const tracking = ref('');
  const creating = ref(false);

  /* ---- Step 2 ---- */
  const addresses = ref<EmailAddressDto[]>([]);
  const addressesLoading = ref(true);
  const addressesError = ref('');
  const verified = computed(() => addresses.value.filter((e) => e.verified));
  const pending = computed(() => addresses.value.filter((e) => !e.verified));
  const emailOn = ref(true);
  /** An address id, or '__new'. */
  const emailChoice = ref<string>('__new');
  const newEmail = ref('');
  const newEmailError = ref('');
  const saving = ref(false);
  const step2Error = ref('');

  const chOn = reactive<Record<AddableChannel, boolean>>({ discord: false, slack: false, telegram: false, webhook: false });
  const chDraft = reactive<Record<AddableChannel, ChannelDraft>>({
    discord: emptyChannelDraft(),
    slack: emptyChannelDraft(),
    telegram: emptyChannelDraft(),
    webhook: emptyChannelDraft(),
  });
  const chErr = reactive<Record<AddableChannel, ChannelErrors>>({ discord: {}, slack: {}, telegram: {}, webhook: {} });
  /** Optional names for the channels, e.g. "#leads". Empty means the API names them. */
  const chLabel = reactive<Record<AddableChannel, string>>({ discord: '', slack: '', telegram: '', webhook: '' });

  /** Channels already created on the server, keyed by type, with the input that made them. */
  const created = reactive<Partial<Record<AddableChannel | 'email', { id: string; key: string }>>>({});
  const webhookSecret = ref('');

  /* ---- Step 3 ---- */
  const tabIndex = ref(0);
  const test = ref<'idle' | 'sending' | 'delivered' | 'failed'>('idle');
  const testNote = ref('');
  const labelOpen = ref(false);

  const endpoint = computed(() => formEndpoint.value || `${typeof location === 'undefined' ? 'https://sendm8.com' : location.origin}/f/··········`);
  const endpointBase = computed(() => baseOf(endpoint.value, formId.value || '··········'));
  const inboxHref = computed(() => (formId.value ? `/app/forms/${formId.value}` : '/app'));
  const tabs = computed(() => setupTabs(endpoint.value).map((t) => ({ ...t, code: t.code.replace(/^\n/, '') })));
  const activeTab = computed(() => tabs.value[tabIndex.value]);
  const codeParts = computed(() => splitAtEndpoint(activeTab.value.code, endpoint.value));

  const chosenAddress = computed(() => addresses.value.find((a) => a.id === emailChoice.value) ?? null);
  const emailTarget = computed(() => {
    if (!emailOn.value) return '';
    return emailChoice.value === '__new' ? newEmail.value.trim() : (chosenAddress.value?.email ?? '');
  });
  const emailNeedsVerify = computed(() => emailOn.value && (emailChoice.value === '__new' || chosenAddress.value?.verified === false));

  const destinations = computed(() =>
    destinationsFor({ emailOn: emailOn.value, emailTarget: emailTarget.value, emailNeedsVerify: emailNeedsVerify.value, chOn, chDraft }),
  );

  const stepState = (n: Step) => stateOf(n, step.value, reached.value);
  const summary = computed(() => ({
    1: name.value.trim(),
    2: destinations.value.map((d) => d.label).join(' · '),
  }));

  async function focusStep(n: Step) {
    await nextTick();
    document.getElementById(`ob-step-${n}-title`)?.focus();
  }
  async function focusFirstInvalid() {
    await nextTick();
    document.querySelector<HTMLElement>('.ob [aria-invalid="true"]')?.focus();
  }

  function go(n: Step) {
    if (n > reached.value) return;
    step.value = n;
    focusStep(n);
  }

  async function loadAddresses() {
    addressesLoading.value = true;
    addressesError.value = '';
    try {
      addresses.value = await api.listEmails();
      if (emailChoice.value === '__new' && !newEmail.value) emailChoice.value = verified.value[0]?.id ?? '__new';
    } catch (err) {
      addressesError.value = friendlyError(err);
    } finally {
      addressesLoading.value = false;
    }
  }

  onMounted(async () => {
    try {
      me.value = await guardSession();
    } catch (err) {
      nameError.value = friendlyError(err);
      return;
    }
    if (me.value) loadAddresses();
  });

  /* ---- Step 1: create (or rename) the form ---- */
  async function submitName() {
    if (creating.value) return;
    const v = name.value.trim();
    nameError.value = validateName(v);
    if (nameError.value) return focusFirstInvalid();

    creating.value = true;
    try {
      if (!formId.value) {
        const dto = await api.createForm({ name: v });
        formId.value = dto.id;
        formEndpoint.value = dto.endpoint;
        tracking.value = trackingNo(dto.id);
        announceFormsChanged();
      } else if (v !== savedName.value) {
        await api.updateForm(formId.value, { name: v });
        announceFormsChanged();
      }
      savedName.value = v;
    } catch (err) {
      nameError.value = fieldError(err).message;
      return focusFirstInvalid();
    } finally {
      creating.value = false;
    }
    step.value = 2;
    if (reached.value < 2) reached.value = 2;
    focusStep(2);
  }

  /* ---- Step 2: create the channels ---- */
  function validateStep2() {
    newEmailError.value = emailOn.value && emailChoice.value === '__new' ? validateNewEmail(newEmail.value, verified.value) : '';
    let ok = !newEmailError.value;
    for (const t of channelOrder) {
      chErr[t] = chOn[t] ? validateChannel(t, chDraft[t]) : {};
      if (Object.keys(chErr[t]).length) ok = false;
    }
    return ok;
  }

  async function dropChannel(key: AddableChannel | 'email') {
    const old = created[key];
    if (!old) return;
    delete created[key];
    if (key === 'webhook') webhookSecret.value = '';
    try {
      await api.deleteChannel(old.id);
    } catch {
      /* it'll show up in settings, where it can be removed */
    }
  }

  async function ensureEmail(): Promise<boolean> {
    if (!emailOn.value) {
      await dropChannel('email');
      return true;
    }
    let addressId = emailChoice.value;
    if (addressId === '__new') {
      try {
        const address = await api.addEmail(newEmail.value);
        addresses.value = [...addresses.value, address];
        addressId = address.id;
      } catch (err) {
        if (errorCode(err) === 'email_exists') {
          await loadAddresses();
          const found = addresses.value.find((a) => a.email === newEmail.value.trim().toLowerCase());
          if (!found) {
            newEmailError.value = friendlyError(err);
            return false;
          }
          addressId = found.id;
        } else {
          newEmailError.value = fieldError(err).message;
          // The address is kept even when the email didn't send, so offer it next time.
          if (isApiError(err) && err.status >= 429) loadAddresses();
          return false;
        }
      }
      emailChoice.value = addressId;
      newEmail.value = '';
    }
    if (created.email?.key === addressId) return true;
    await dropChannel('email');
    try {
      const ch = await api.createChannel(formId.value, { type: 'email', emailAddressId: addressId });
      created.email = { id: ch.id, key: addressId };
    } catch (err) {
      if (errorCode(err) !== 'channel_exists') {
        step2Error.value = `Email: ${friendlyError(err)}`;
        return false;
      }
    }
    return true;
  }

  async function ensureChannel(t: AddableChannel): Promise<boolean> {
    if (!chOn[t]) {
      await dropChannel(t);
      return true;
    }
    const input = channelInput(t, chDraft[t]);
    const key = JSON.stringify([input, chLabel[t].trim()]);
    if (created[t]?.key === key) return true;
    await dropChannel(t);
    try {
      const ch = await api.createChannel(formId.value, input, chLabel[t]);
      created[t] = { id: ch.id, key };
      if (ch.secret) webhookSecret.value = ch.secret;
      return true;
    } catch (err) {
      if (errorCode(err) === 'channel_exists') return true;
      if (errorCode(err) === 'channel_invalid' || errorCode(err) === 'validation_failed') {
        // channel_invalid messages can carry a field prefix too, e.g. "url: must be public".
        const fe = isApiError(err) && err.code === 'channel_invalid' ? splitValidation(err.message) : fieldError(err);
        chErr[t] = { [draftField(fe.field, t)]: fe.message };
      } else {
        step2Error.value = `${channelMeta[t].name}: ${friendlyError(err)}`;
      }
      return false;
    }
  }

  async function submitDestinations() {
    if (saving.value) return;
    step2Error.value = '';
    if (!validateStep2()) return focusFirstInvalid();
    saving.value = true;
    try {
      const results = [await ensureEmail()];
      for (const t of channelOrder) results.push(await ensureChannel(t));
      if (results.includes(false)) return focusFirstInvalid();
    } finally {
      saving.value = false;
    }
    step.value = 3;
    if (reached.value < 3) reached.value = 3;
    focusStep(3);
  }

  // Clear a channel's errors as soon as it's switched off or edited
  for (const t of channelOrder) {
    watch(
      () => [chOn[t], chDraft[t].url, chDraft[t].botToken, chDraft[t].chatId],
      () => {
        if (Object.keys(chErr[t]).length) chErr[t] = chOn[t] ? validateChannel(t, chDraft[t]) : {};
      },
    );
  }
  watch([newEmail, emailChoice, emailOn], () => {
    if (newEmailError.value) newEmailError.value = '';
  });
  watch([name, destinations], () => {
    if (test.value === 'delivered') test.value = 'idle';
  });

  function onTabKey(e: KeyboardEvent) {
    const i = nextTabIndex(e.key, tabIndex.value, tabs.value.length);
    if (i === null) return;
    e.preventDefault();
    tabIndex.value = i;
    nextTick(() => document.getElementById(`ob-tab-${i}`)?.focus());
  }

  /* ---- Step 3: a real submission through the real endpoint ---- */
  async function sendTest() {
    if (test.value === 'sending' || !formId.value) return;
    test.value = 'sending';
    testNote.value = 'Test submission in transit…';
    try {
      const result = await api.submit(formId.value, {
        name: me.value?.user.name || 'Test Mate',
        email: me.value?.user.email ?? '',
        message: 'G’day! This is a test submission sent from the sendm8 setup page.',
      });
      test.value = 'delivered';
      tracking.value = trackingNo(result.id);
      testNote.value = testSentNote(tracking.value, destinations.value, emailNeedsVerify.value);
      if (window.innerWidth < 1024) labelOpen.value = true;
    } catch (err) {
      test.value = 'failed';
      testNote.value = `The test didn’t go through: ${friendlyError(err)}`;
    }
  }

  return {
    // flow
    step,
    reached,
    stepState,
    summary,
    go,
    maxWeightKb,
    // step 1
    name,
    nameError,
    formId,
    tracking,
    creating,
    submitName,
    // step 2
    addresses,
    addressesLoading,
    addressesError,
    verified,
    pending,
    emailOn,
    emailChoice,
    newEmail,
    newEmailError,
    chosenAddress,
    chOn,
    chDraft,
    chErr,
    chLabel,
    saving,
    step2Error,
    loadAddresses,
    submitDestinations,
    destinations,
    // step 3
    endpoint,
    endpointBase,
    inboxHref,
    webhookSecret,
    tabs,
    tabIndex,
    activeTab,
    codeParts,
    onTabKey,
    test,
    testNote,
    sendTest,
    labelOpen,
  };
}

export type Onboarding = ReturnType<typeof createOnboarding>;

const KEY: InjectionKey<Onboarding> = Symbol('onboarding');

export function provideOnboarding(bodyKb: number) {
  const flow = createOnboarding(bodyKb);
  provide(KEY, flow);
  return flow;
}

export function useOnboarding() {
  const flow = inject(KEY);
  if (!flow) throw new Error('useOnboarding() needs provideOnboarding() in a parent component');
  return flow;
}
