/** Pure rules for the Channels tab: slip state, the add-channel form, and webhook secrets. */
import type { EmailAddressDto } from '@sendm8/shared';
import type { CreateChannelInput } from '../../../lib/api/endpoints';
import type { Channel } from '../../../lib/api/types';
import { isEmail, type AddableChannel, type ChannelDraft, type ChannelErrors } from '../SettingsChannelRules';

/** A channel as the settings page shows it: the saved channel plus its slip's UI state. */
export interface ChanState extends Channel {
  testing: boolean;
  busy: boolean;
  confirmRemove: boolean;
  reveal: boolean;
  announce: string;
  /** Only known right after creating or rotating. */
  secret?: string;
  renaming: boolean;
  renameDraft: string;
  renameError: string;
}

export const chanState = (c: Channel, extra: Partial<ChanState> = {}): ChanState => ({
  ...c,
  testing: false,
  busy: false,
  confirmRemove: false,
  reveal: false,
  announce: '',
  renaming: false,
  renameDraft: '',
  renameError: '',
  ...extra,
});

export type AddType = AddableChannel | 'email';
export type AddErrors = ChannelErrors & { email?: string; label?: string };

export const addTypes: AddType[] = ['email', 'discord', 'slack', 'telegram', 'webhook'];

/** Radio value for "A different address" in the email picker. */
export const NEW_ADDRESS = '__new';

export const labelPlaceholders: Record<AddType, string> = {
  email: 'The address',
  discord: 'Your Discord webhook’s name',
  slack: 'Slack webhook',
  telegram: 'The chat’s name',
  webhook: 'The URL’s host',
};

export const MAX_LABEL = 60;

/** Shows the start and end of a webhook signing secret. */
export const maskSecret = (s: string) => `${s.slice(0, 6)}${'•'.repeat(14)}${s.slice(-4)}`;

export function validateRename(label: string): string {
  if (!label) return 'Give it a name, or cancel to keep the old one.';
  return label.length > MAX_LABEL ? 'Keep it to 60 characters.' : '';
}

export const labelError = (label: string) => (label.trim().length > MAX_LABEL ? 'Keep the label to 60 characters.' : undefined);

/** The address picked first when the form opens: a verified one, else any, else a new one. */
export const defaultAddressChoice = (addresses: EmailAddressDto[]) => addresses.find((a) => a.verified)?.id ?? addresses[0]?.id ?? NEW_ADDRESS;

/** Errors for the email picker: only a brand-new address needs checking. */
export function validateEmailChoice(choice: string, newEmail: string): AddErrors {
  if (choice !== NEW_ADDRESS) return {};
  const v = newEmail.trim();
  if (!v) return { email: 'Which address should we send to?' };
  if (!isEmail(v)) return { email: 'That email doesn’t look quite right. Check for typos.' };
  return {};
}

/** The create request for a non-email channel. */
export function channelInput(type: AddableChannel, d: ChannelDraft): CreateChannelInput {
  if (type === 'telegram') return { type: 'telegram', botToken: d.botToken.trim(), chatId: d.chatId.trim() };
  if (type === 'webhook') return { type: 'webhook', url: d.url.trim() };
  return { type, webhookUrl: d.url.trim() };
}

/** Which add-form input a rejected create belongs to. */
export function createErrorKey(type: AddableChannel, field: string | null): keyof AddErrors {
  if (field === 'label') return 'label';
  if (field === 'botToken' || field === 'chatId') return field;
  return type === 'telegram' ? 'botToken' : 'url';
}
