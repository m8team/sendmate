/**
 * Pure helpers for the onboarding flow: validation copy, the dispatch label's destination list,
 * the API payload for each channel and the snippet tabs' keyboard handling.
 */
import type { EmailAddressDto } from '@sendm8/shared';
import type { CreateChannelInput } from '../../../lib/api/endpoints';
import { channelMeta, isEmail, maskTarget, type AddableChannel, type ChannelDraft } from '../SettingsChannelRules';

export type Step = 1 | 2 | 3;
export type StepState = 'current' | 'done' | 'todo';

export const STEPS: Step[] = [1, 2, 3];
export const NAME_MAX = 100;
export const channelOrder: AddableChannel[] = ['discord', 'slack', 'telegram', 'webhook'];

/** Where a step stands, given the step on screen and the furthest one reached. */
export const stepState = (n: Step, step: Step, reached: Step): StepState => (step === n ? 'current' : n < reached ? 'done' : 'todo');

/** Error copy for the form name, or '' when it's fine. */
export function validateName(raw: string): string {
  const v = raw.trim();
  if (!v) return 'Give it a name. Anything you’ll recognise in a list will do.';
  if (v.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters. It has to fit on the label.`;
  return '';
}

/** Error copy for a new notification address, or '' when it's fine. */
export function validateNewEmail(raw: string, verified: EmailAddressDto[]): string {
  const v = raw.trim();
  if (!v) return 'Which address should we send to?';
  if (!isEmail(v)) return 'That email doesn’t look quite right. Check for typos.';
  if (verified.some((e) => e.email === v.toLowerCase())) return 'Good news: that one’s already verified. Pick it from the list above.';
  return '';
}

/** The create-channel payload for a draft. */
export function channelInput(t: AddableChannel, d: ChannelDraft): CreateChannelInput {
  if (t === 'telegram') return { type: 'telegram', botToken: d.botToken.trim(), chatId: d.chatId.trim() };
  if (t === 'webhook') return { type: 'webhook', url: d.url.trim() };
  return { type: t, webhookUrl: d.url.trim() };
}

/** Maps an API field name onto the draft field that shows the error. */
export const draftField = (field: string | null, t: AddableChannel): keyof ChannelDraft => {
  if (field === 'botToken' || field === 'chatId') return field;
  if (t === 'telegram') return 'botToken';
  return 'url';
};

export interface Dest {
  key: string;
  icon: 'inbox' | 'mail' | 'discord' | 'slack' | 'telegram' | 'webhook';
  label: string;
  detail: string;
  note?: string;
}

export interface DestinationsInput {
  emailOn: boolean;
  /** The address email goes to, or '' when there isn't one yet. */
  emailTarget: string;
  emailNeedsVerify: boolean;
  chOn: Record<AddableChannel, boolean>;
  chDraft: Record<AddableChannel, ChannelDraft>;
}

/** Everywhere a submission will go, in the order the dispatch label lists them. */
export function destinationsFor({ emailOn, emailTarget, emailNeedsVerify, chOn, chDraft }: DestinationsInput): Dest[] {
  const list: Dest[] = [{ key: 'inbox', icon: 'inbox', label: 'Dashboard inbox', detail: 'Always on' }];
  if (emailOn) {
    list.push({
      key: 'email',
      icon: 'mail',
      label: 'Email',
      detail: emailTarget || 'address to come',
      note: emailNeedsVerify && emailTarget ? 'Awaiting verification' : undefined,
    });
  }
  for (const t of channelOrder) {
    if (!chOn[t]) continue;
    const d = chDraft[t];
    const filled = t === 'telegram' ? d.botToken.trim() && d.chatId.trim() : d.url.trim();
    list.push({ key: t, icon: channelMeta[t].icon, label: channelMeta[t].name, detail: filled ? maskTarget(t, d) : 'details to come' });
  }
  return list;
}

/** The status line after a test submission: "Posted SM8 …. Sending it to your inbox, Discord." */
export function testSentNote(tracking: string, destinations: Dest[], emailNeedsVerify: boolean): string {
  const parts = destinations.map((d) =>
    d.key === 'email' && emailNeedsVerify ? 'Email (held until you verify the address)' : d.key === 'inbox' ? 'your inbox' : d.label,
  );
  return `Posted ${tracking}. Sending it to ${parts.join(', ')}.`;
}

/** Splits a snippet around the endpoint URL so it can be highlighted. */
export function splitAtEndpoint(code: string, endpoint: string) {
  const i = code.indexOf(endpoint);
  if (i < 0) return { before: code, url: '', after: '' };
  return { before: code.slice(0, i), url: endpoint, after: code.slice(i + endpoint.length) };
}

/** Arrow keys, Home and End for a row of tabs. Null for any other key. */
export function nextTabIndex(key: string, i: number, n: number): number | null {
  if (key === 'ArrowRight') return (i + 1) % n;
  if (key === 'ArrowLeft') return (i - 1 + n) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return null;
}
