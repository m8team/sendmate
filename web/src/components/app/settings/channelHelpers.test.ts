import { describe, expect, it } from 'vitest';
import type { EmailAddressDto } from '@sendm8/shared';
import type { Channel } from '../../../lib/api/types';
import { emptyChannelDraft } from '../SettingsChannelRules';
import {
  NEW_ADDRESS,
  chanState,
  channelInput,
  createErrorKey,
  defaultAddressChoice,
  labelError,
  maskSecret,
  validateEmailChoice,
  validateRename,
} from './channelHelpers';

const channel: Channel = { id: 'ch1', formId: 'f1', type: 'webhook', label: 'api.example.com', enabled: true, createdAt: 1, lastTest: null };
const address = (id: string, verified: boolean) => ({ id, email: `${id}@example.com`, verified }) as EmailAddressDto;

describe('chanState', () => {
  it('starts a slip idle', () => {
    expect(chanState(channel)).toEqual({
      ...channel,
      testing: false,
      busy: false,
      confirmRemove: false,
      reveal: false,
      announce: '',
      renaming: false,
      renameDraft: '',
      renameError: '',
    });
  });

  it('takes overrides, like a fresh webhook secret', () => {
    const s = chanState(channel, { reveal: true, secret: 'whsec_abc' });
    expect(s.reveal).toBe(true);
    expect(s.secret).toBe('whsec_abc');
  });
});

describe('maskSecret', () => {
  it('keeps the first six and last four characters', () => {
    expect(maskSecret('whsec_1234567890abcdef')).toBe(`whsec_${'•'.repeat(14)}cdef`);
  });
});

describe('validateRename', () => {
  it('needs a label of at most 60 characters', () => {
    expect(validateRename('')).toMatch(/Give it a name/);
    expect(validateRename('a'.repeat(60))).toBe('');
    expect(validateRename('a'.repeat(61))).toBe('Keep it to 60 characters.');
  });
});

describe('labelError', () => {
  it('allows an empty or short label', () => {
    expect(labelError('')).toBeUndefined();
    expect(labelError(` ${'a'.repeat(60)} `)).toBeUndefined();
  });

  it('flags labels over 60 characters', () => {
    expect(labelError('a'.repeat(61))).toBe('Keep the label to 60 characters.');
  });
});

describe('defaultAddressChoice', () => {
  it('prefers a verified address, then any address, then a new one', () => {
    expect(defaultAddressChoice([address('a', false), address('b', true)])).toBe('b');
    expect(defaultAddressChoice([address('a', false)])).toBe('a');
    expect(defaultAddressChoice([])).toBe(NEW_ADDRESS);
  });
});

describe('validateEmailChoice', () => {
  it('trusts an existing address', () => {
    expect(validateEmailChoice('addr_1', '')).toEqual({});
  });

  it('checks a new address', () => {
    expect(validateEmailChoice(NEW_ADDRESS, ' ')).toEqual({ email: 'Which address should we send to?' });
    expect(validateEmailChoice(NEW_ADDRESS, 'nope')).toEqual({ email: 'That email doesn’t look quite right. Check for typos.' });
    expect(validateEmailChoice(NEW_ADDRESS, ' hi@example.com ')).toEqual({});
  });
});

describe('channelInput', () => {
  const draft = { ...emptyChannelDraft(), url: ' https://example.com/hook ', botToken: ' 123:abc ', chatId: ' -100 ' };

  it('builds a trimmed create request for each type', () => {
    expect(channelInput('webhook', draft)).toEqual({ type: 'webhook', url: 'https://example.com/hook' });
    expect(channelInput('discord', draft)).toEqual({ type: 'discord', webhookUrl: 'https://example.com/hook' });
    expect(channelInput('slack', draft)).toEqual({ type: 'slack', webhookUrl: 'https://example.com/hook' });
    expect(channelInput('telegram', draft)).toEqual({ type: 'telegram', botToken: '123:abc', chatId: '-100' });
  });
});

describe('createErrorKey', () => {
  it('uses the field the API named', () => {
    expect(createErrorKey('discord', 'label')).toBe('label');
    expect(createErrorKey('telegram', 'chatId')).toBe('chatId');
    expect(createErrorKey('telegram', 'botToken')).toBe('botToken');
  });

  it('falls back to the main input for the type', () => {
    expect(createErrorKey('telegram', null)).toBe('botToken');
    expect(createErrorKey('slack', 'webhookUrl')).toBe('url');
    expect(createErrorKey('webhook', null)).toBe('url');
  });
});
