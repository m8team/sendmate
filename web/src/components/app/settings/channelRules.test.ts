import { describe, expect, it } from 'vitest';
import { barsFor, emptyChannelDraft, hourLabel, isDomain, isEmail, maskTarget, normaliseDomain, validateChannel, validateRedirect } from '../SettingsChannelRules';

// Built in pieces so secret scanners don't mistake this fake for a real webhook.
const SLACK_HOOK = ['https://hooks.slack.com/services', 'T04ABC', 'B07DEF', 'xyz123'].join('/');

const draft = (patch: Partial<ReturnType<typeof emptyChannelDraft>>) => ({ ...emptyChannelDraft(), ...patch });

describe('validateChannel', () => {
  it('checks Discord webhook URLs', () => {
    expect(validateChannel('discord', draft({}))).toEqual({ url: 'Paste the webhook URL from Discord.' });
    expect(validateChannel('discord', draft({ url: 'https://example.com/hook' })).url).toMatch(/isn’t a Discord webhook/);
    expect(validateChannel('discord', draft({ url: 'https://discord.com/api/webhooks/123/abc-DEF_1' }))).toEqual({});
    expect(validateChannel('discord', draft({ url: 'https://ptb.discordapp.com/api/webhooks/123/abc/' }))).toEqual({});
  });

  it('checks Slack incoming webhook URLs', () => {
    expect(validateChannel('slack', draft({})).url).toMatch(/Paste the incoming webhook/);
    expect(validateChannel('slack', draft({ url: 'https://hooks.slack.com/services/T0/B0' })).url).toMatch(/isn’t a Slack/);
    expect(validateChannel('slack', draft({ url: SLACK_HOOK }))).toEqual({});
  });

  it('checks Telegram bot tokens and chat ids', () => {
    expect(validateChannel('telegram', draft({}))).toEqual({ botToken: 'Paste the token @BotFather gave you.', chatId: 'Which chat should we post to?' });
    const token = `123456789:${'A'.repeat(35)}`;
    expect(validateChannel('telegram', draft({ botToken: 'nope', chatId: 'nope' }))).toEqual({
      botToken: expect.stringMatching(/Bot tokens look like/),
      chatId: expect.stringMatching(/numeric chat id/),
    });
    expect(validateChannel('telegram', draft({ botToken: token, chatId: '-1001234567890' }))).toEqual({});
    expect(validateChannel('telegram', draft({ botToken: token, chatId: '@my_channel' }))).toEqual({});
  });

  it('keeps generic webhooks on public https hosts', () => {
    expect(validateChannel('webhook', draft({})).url).toMatch(/Where should we POST/);
    expect(validateChannel('webhook', draft({ url: 'not a url' })).url).toMatch(/doesn’t look like a URL/);
    expect(validateChannel('webhook', draft({ url: 'http://example.com' })).url).toMatch(/have to use https/);
    expect(validateChannel('webhook', draft({ url: 'https://10.0.0.1/hook' })).url).toMatch(/not an IP address/);
    expect(validateChannel('webhook', draft({ url: 'https://[::1]/hook' })).url).toMatch(/not an IP address/);
    expect(validateChannel('webhook', draft({ url: 'https://localhost/hook' })).url).toMatch(/localhost or internal/);
    expect(validateChannel('webhook', draft({ url: 'https://box.internal/hook' })).url).toMatch(/localhost or internal/);
    expect(validateChannel('webhook', draft({ url: 'https://api.example.com/hooks/sendm8' }))).toEqual({});
  });
});

describe('maskTarget', () => {
  it('masks Discord and Slack webhook secrets', () => {
    expect(maskTarget('discord', draft({ url: 'https://discord.com/api/webhooks/123456/abcdefXYZ' }))).toBe('discord.com/api/webhooks/1234…/•••• XYZ');
    expect(maskTarget('slack', draft({ url: SLACK_HOOK }))).toBe('hooks.slack.com/services/T04…/•••• 123');
  });

  it('masks Telegram bots and numeric chats, but not public channel names', () => {
    expect(maskTarget('telegram', draft({ botToken: '123456:abc', chatId: '-1001234' }))).toBe('Bot 123••• → chat -1•••••34');
    expect(maskTarget('telegram', draft({ botToken: '123456:abc', chatId: '@news' }))).toBe('Bot 123••• → chat @news');
  });

  it('shows plain webhook URLs as they are', () => {
    expect(maskTarget('webhook', draft({ url: ' https://example.com/hook ' }))).toBe('https://example.com/hook');
  });
});

describe('domains', () => {
  it('normalises pasted URLs down to the hostname', () => {
    expect(normaliseDomain(' HTTPS://Example.com:8080/contact?x=1 ')).toBe('example.com');
    expect(normaliseDomain('*.example.com')).toBe('*.example.com');
  });

  it('recognises hostnames', () => {
    expect(isDomain('example.com')).toBe(true);
    expect(isDomain('*.sub.example.co.uk')).toBe(true);
    expect(isDomain('example')).toBe(false);
    expect(isDomain('-bad.com')).toBe(false);
  });
});

describe('validateRedirect', () => {
  it('allows an empty redirect', () => {
    expect(validateRedirect('  ', ['example.com'])).toBeUndefined();
  });

  it('needs a full https URL', () => {
    expect(validateRedirect('example.com/thanks', [])).toMatch(/full URL/);
    expect(validateRedirect('ftp://example.com', [])).toMatch(/full URL/);
    expect(validateRedirect('http://example.com', [])).toMatch(/Use https/);
  });

  it('allows any https redirect when no domains are set', () => {
    expect(validateRedirect('https://anywhere.org/thanks', [])).toBeUndefined();
  });

  it('keeps the redirect on an allowed domain or its subdomains', () => {
    expect(validateRedirect('https://example.com/thanks', ['example.com'])).toBeUndefined();
    expect(validateRedirect('https://www.example.com/thanks', ['*.example.com'])).toBeUndefined();
    expect(validateRedirect('https://evil.com/thanks', ['example.com'])).toBe('evil.com isn’t on your allowed domains list. Add it below, or redirect to example.com.');
  });
});

describe('small helpers', () => {
  it('checks email shape', () => {
    expect(isEmail(' hi@example.com ')).toBe(true);
    expect(isEmail('hi@example')).toBe(false);
  });

  it('labels the digest hour', () => {
    expect(hourLabel(8)).toBe('08:00 UTC');
    expect(hourLabel(18)).toBe('18:00 UTC');
  });

  it('draws the same barcode for the same value', () => {
    const a = barsFor('k3x9q2m7ab');
    expect(barsFor('k3x9q2m7ab')).toEqual(a);
    expect(a.width).toBeGreaterThanOrEqual(150);
    expect(barsFor('another')).not.toEqual(a);
  });
});
