import { computed, nextTick, reactive, ref, watch, type Ref } from 'vue';
import type { EmailAddressDto } from '@sendm8/shared';
import { api, type CreateChannelInput } from '../../../lib/api/endpoints';
import { isApiError } from '../../../lib/api/client';
import { toChannel } from '../../../lib/api/adapters';
import { errorCode, fieldError, friendlyError, splitValidation } from '../../../lib/api/errors';
import { toast } from '../../../lib/toast';
import { channelMeta, emptyChannelDraft, validateChannel, type ChannelDraft } from '../SettingsChannelRules';
import {
  NEW_ADDRESS,
  addTypes,
  chanState,
  channelInput,
  createErrorKey,
  defaultAddressChoice,
  labelError,
  labelPlaceholders,
  validateEmailChoice,
  type AddErrors,
  type AddType,
  type ChanState,
} from './channelHelpers';

interface AddChannelOptions {
  formId: () => string;
  /** The account's recipient addresses. A new address typed here is added to it. */
  addresses: Ref<EmailAddressDto[]>;
  onAdded: (channel: ChanState) => void;
}

/**
 * The "Add channel" form. Its state outlives the form itself, so the picked type is still
 * selected when it's opened again.
 */
export function useAddChannel({ formId, addresses, onAdded }: AddChannelOptions) {
  const adding = ref(false);
  const addType = ref<AddType>('email');
  const addDraft = reactive<ChannelDraft>(emptyChannelDraft());
  const addErr = ref<AddErrors>({});
  const addBusy = ref(false);
  const addEmailChoice = ref<string>(NEW_ADDRESS);
  const addNewEmail = ref('');
  const checkInbox = ref<string | null>(null);
  const addLabel = ref('');
  // Labels can be renamed, so we can't tell which addresses are taken: the API answers channel_exists.
  const pickableAddresses = computed(() => addresses.value);
  const addLabelDefault = computed(() => labelPlaceholders[addType.value]);

  const focusInvalid = async () => {
    await nextTick();
    document.querySelector<HTMLElement>('.addpanel [aria-invalid="true"]')?.focus();
  };

  async function openAdd() {
    adding.value = true;
    checkInbox.value = null;
    addEmailChoice.value = defaultAddressChoice(pickableAddresses.value);
    await nextTick();
    document.querySelector<HTMLInputElement>('.addtype input:checked')?.focus();
  }

  async function cancelAdd() {
    adding.value = false;
    Object.assign(addDraft, emptyChannelDraft());
    addNewEmail.value = '';
    addLabel.value = '';
    addErr.value = {};
    await nextTick();
    document.getElementById('fs-add-channel')?.focus();
  }

  watch(addType, () => (addErr.value = {}));
  watch(
    () => ({ ...addDraft }),
    () => {
      if (Object.keys(addErr.value).length && addType.value !== 'email') addErr.value = validateChannel(addType.value, addDraft);
    },
  );

  /** Finds or creates the typed address, and returns its id. */
  async function newAddressId() {
    let newAddress: EmailAddressDto | null = null;
    try {
      newAddress = await api.addEmail(addNewEmail.value);
    } catch (err) {
      if (errorCode(err) !== 'email_exists') throw err;
      addresses.value = await api.listEmails();
      newAddress = addresses.value.find((a) => a.email === addNewEmail.value.trim().toLowerCase()) ?? null;
      if (!newAddress) throw err;
    }
    if (!addresses.value.some((a) => a.id === newAddress!.id)) addresses.value = [...addresses.value, newAddress];
    return newAddress.id;
  }

  async function addChannel() {
    if (addBusy.value) return;
    const t = addType.value;
    addErr.value = t === 'email' ? validateEmailChoice(addEmailChoice.value, addNewEmail.value) : validateChannel(t, addDraft);
    const label = labelError(addLabel.value);
    if (label) addErr.value = { ...addErr.value, label };
    if (Object.keys(addErr.value).length) return focusInvalid();

    addBusy.value = true;
    try {
      let input: CreateChannelInput;
      if (t === 'email') {
        const id = addEmailChoice.value === NEW_ADDRESS ? await newAddressId() : addEmailChoice.value;
        input = { type: 'email', emailAddressId: id };
      } else {
        input = channelInput(t, addDraft);
      }
      const dto = await api.createChannel(formId(), input, addLabel.value);
      onAdded(chanState(toChannel(dto), { reveal: Boolean(dto.secret), secret: dto.secret }));
      addLabel.value = '';
      if (t === 'email' && dto.recipientVerified === false) {
        checkInbox.value = dto.label;
        toast(`Email channel added. Check ${dto.label} for a verification link.`);
      } else {
        toast(`${channelMeta[t].name} channel added. Send it a test.`);
      }
      adding.value = false;
      Object.assign(addDraft, emptyChannelDraft());
      addNewEmail.value = '';
      await nextTick();
      document.getElementById(`fs-test-${dto.id}`)?.focus();
    } catch (err) {
      const code = errorCode(err);
      if (t === 'email') {
        addErr.value = { email: friendlyError(err) };
      } else if (code === 'channel_invalid' || code === 'validation_failed') {
        const fe = isApiError(err) && code === 'channel_invalid' ? splitValidation(err.message) : fieldError(err);
        addErr.value = { [createErrorKey(t, fe.field)]: fe.message };
      } else {
        addErr.value = { [t === 'telegram' ? 'botToken' : 'url']: friendlyError(err) };
      }
      await focusInvalid();
    } finally {
      addBusy.value = false;
    }
  }

  return {
    adding,
    addType,
    addTypes,
    addDraft,
    addErr,
    addBusy,
    addEmailChoice,
    addNewEmail,
    checkInbox,
    addLabel,
    pickableAddresses,
    addLabelDefault,
    openAdd,
    cancelAdd,
    addChannel,
  };
}
