import { describe, expect, it } from 'vitest';
import type { EmailAddressDto } from '@sendm8/shared';
import { emptyChannelDraft, type AddableChannel, type ChannelDraft } from '../SettingsChannelRules';
import {
  NAME_MAX,
  channelInput,
  destinationsFor,
  draftField,
  nextTabIndex,
  splitAtEndpoint,
  stepState,
  testSentNote,
  validateName,
  validateNewEmail,
} from './onboardingLogic';

const address = (email: string, verified: boolean): EmailAddressDto => ({
  id: email,
  email,
  verified,
  verifiedAt: verified ? 1 : null,
  verificationSentAt: 1,
  createdAt: 1,
});

const noChannels = () => ({
  chOn: { discord: false, slack: false, telegram: false, webhook: false } as Record<AddableChannel, boolean>,
  chDraft: { discord: emptyChannelDraft(), slack: emptyChannelDraft(), telegram: emptyChannelDraft(), webhook: emptyChannelDraft() } as Record<
    AddableChannel,
    ChannelDraft
  >,
});

describe('stepState', () => {
  it('marks the step on screen as current, earlier reached steps as done, the rest to do', () => {
    expect(stepState(2, 2, 3)).toBe('current');
    expect(stepState(1, 2, 3)).toBe('done');
    expect(stepState(3, 2, 3)).toBe('todo');
    expect(stepState(3, 1, 1)).toBe('todo');
  });
});

describe('validateName', () => {
  it('needs a name that fits on the label', () => {
    expect(validateName('   ')).toBe('Give it a name. Anything you’ll recognise in a list will do.');
    expect(validateName('x'.repeat(NAME_MAX + 1))).toBe('Keep it under 100 characters. It has to fit on the label.');
    expect(validateName(`  ${'x'.repeat(NAME_MAX)}  `)).toBe('');
  });
});

describe('validateNewEmail', () => {
  const verified = [address('jo@example.com', true)];

  it('asks for an address, checks the shape, and points at ones already verified', () => {
    expect(validateNewEmail('', verified)).toBe('Which address should we send to?');
    expect(validateNewEmail('nope', verified)).toBe('That email doesn’t look quite right. Check for typos.');
    expect(validateNewEmail(' Jo@Example.com ', verified)).toBe('Good news: that one’s already verified. Pick it from the list above.');
    expect(validateNewEmail('new@example.com', verified)).toBe('');
  });
});

describe('channelInput', () => {
  it('builds the API payload for each channel type, trimmed', () => {
    const d: ChannelDraft = { url: ' https://x.test/hook ', botToken: ' 123:abc ', chatId: ' -100 ' };
    expect(channelInput('discord', d)).toEqual({ type: 'discord', webhookUrl: 'https://x.test/hook' });
    expect(channelInput('slack', d)).toEqual({ type: 'slack', webhookUrl: 'https://x.test/hook' });
    expect(channelInput('webhook', d)).toEqual({ type: 'webhook', url: 'https://x.test/hook' });
    expect(channelInput('telegram', d)).toEqual({ type: 'telegram', botToken: '123:abc', chatId: '-100' });
  });
});

describe('draftField', () => {
  it('shows API errors next to the matching input', () => {
    expect(draftField('chatId', 'telegram')).toBe('chatId');
    expect(draftField('botToken', 'telegram')).toBe('botToken');
    expect(draftField(null, 'telegram')).toBe('botToken');
    expect(draftField('webhookUrl', 'discord')).toBe('url');
    expect(draftField(null, 'webhook')).toBe('url');
  });
});

describe('destinationsFor', () => {
  it('always starts with the dashboard inbox', () => {
    expect(destinationsFor({ emailOn: false, emailTarget: '', emailNeedsVerify: false, ...noChannels() })).toEqual([
      { key: 'inbox', icon: 'inbox', label: 'Dashboard inbox', detail: 'Always on' },
    ]);
  });

  it('lists email with a verification note only once there is an address', () => {
    const blank = destinationsFor({ emailOn: true, emailTarget: '', emailNeedsVerify: true, ...noChannels() });
    expect(blank[1]).toEqual({ key: 'email', icon: 'mail', label: 'Email', detail: 'address to come', note: undefined });
    const pending = destinationsFor({ emailOn: true, emailTarget: 'jo@example.com', emailNeedsVerify: true, ...noChannels() });
    expect(pending[1]).toMatchObject({ detail: 'jo@example.com', note: 'Awaiting verification' });
  });

  it('adds switched-on channels in order, masked once filled in', () => {
    const c = noChannels();
    c.chOn.webhook = true;
    c.chOn.discord = true;
    c.chOn.telegram = true;
    c.chDraft.discord.url = 'https://discord.com/api/webhooks/123456789/abcdefxyz';
    c.chDraft.telegram.botToken = '123456:abc';
    const list = destinationsFor({ emailOn: false, emailTarget: '', emailNeedsVerify: false, ...c });
    expect(list.map((d) => d.key)).toEqual(['inbox', 'discord', 'telegram', 'webhook']);
    expect(list[1]).toMatchObject({ icon: 'discord', label: 'Discord', detail: 'discord.com/api/webhooks/1234…/•••• xyz' });
    expect(list[2].detail).toBe('details to come');
    expect(list[3]).toMatchObject({ label: 'Webhook', detail: 'details to come' });
  });
});

describe('testSentNote', () => {
  it('names every destination, and says when email is held for verification', () => {
    const dests = destinationsFor({ emailOn: true, emailTarget: 'jo@example.com', emailNeedsVerify: true, ...noChannels() });
    expect(testSentNote('SM8 1234 5678 90', dests, true)).toBe('Posted SM8 1234 5678 90. Sending it to your inbox, Email (held until you verify the address).');
    expect(testSentNote('SM8 1234 5678 90', dests, false)).toBe('Posted SM8 1234 5678 90. Sending it to your inbox, Email.');
  });
});

describe('splitAtEndpoint', () => {
  it('splits around the endpoint so it can be highlighted', () => {
    expect(splitAtEndpoint('<form action="https://x/f/1">', 'https://x/f/1')).toEqual({ before: '<form action="', url: 'https://x/f/1', after: '">' });
    expect(splitAtEndpoint('no url here', 'https://x/f/1')).toEqual({ before: 'no url here', url: '', after: '' });
  });
});

describe('nextTabIndex', () => {
  it('wraps arrow keys and jumps with Home and End', () => {
    expect(nextTabIndex('ArrowRight', 4, 5)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, 5)).toBe(4);
    expect(nextTabIndex('Home', 3, 5)).toBe(0);
    expect(nextTabIndex('End', 1, 5)).toBe(4);
    expect(nextTabIndex('Enter', 1, 5)).toBeNull();
  });
});
