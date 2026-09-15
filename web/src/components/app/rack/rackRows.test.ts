import { describe, expect, it } from 'vitest';
import type { EmailSettingsDto, MeDto } from '@sendm8/shared';
import type { Form } from '../../../lib/api/types';
import { rackRows, rackSummary, slotNo, todayLabel, trendWord } from './rackRows';

const form = (over: Partial<Form> = {}): Form =>
  ({
    id: 'f1',
    name: 'Contact',
    status: 'active',
    endpoint: 'https://sendm8.com/f/f1',
    endpointBase: 'sendm8.com/f/',
    emailEndpoint: null,
    daily: [],
    monthCount: 0,
    monthlyLimit: 1000,
    lastReceivedAt: null,
    flag: null,
    counts: null,
    ...over,
  }) as Form;

const me = { limits: { submissionsPerFormPerMonth: 1000, instantEmailsPerUserPerDay: 100, spamRetentionDays: 14, digestHourUtc: 18 } } as unknown as MeDto;
const email = (over: Partial<EmailSettingsDto> = {}) =>
  ({ byok: { configured: false, healthy: false }, usage: { instantToday: 85, instantLimit: 100 }, digestHourUtc: 9, ...over }) as unknown as EmailSettingsDto;

describe('trendWord', () => {
  it('compares the last week with the one before', () => {
    expect(trendWord([])).toBe('flat, nothing in the last two weeks');
    expect(trendWord([...Array(7).fill(1), ...Array(7).fill(2)])).toBe('rising');
    expect(trendWord([...Array(7).fill(2), ...Array(7).fill(1)])).toBe('falling');
    expect(trendWord(Array(14).fill(1))).toBe('steady');
  });
});

describe('rackRows', () => {
  it('numbers pigeonholes and fills in counts', () => {
    const rows = rackRows(
      [form({ monthCount: 1234, daily: [1, 5, 2], emailEndpoint: 'https://sendm8.com/f/you@example.com' }), form({ id: 'f2' })],
      { f1: { count: 3, more: true } },
    );
    expect(rows[0]).toMatchObject({ no: '01', unread: 3, unreadLabel: '3+', pct: 100, href: '/app/forms/f1', address: 'you@example.com' });
    expect(rows[0].spark).toBe('30-day trend, 1,234 this month, busiest day 5, rising.');
    expect(rows[1]).toMatchObject({ no: '02', unread: 0, unreadLabel: '', pct: 0, address: null });
  });

  it('numbers the next empty slot', () => {
    expect(slotNo(2)).toBe('03');
  });
});

describe('rackSummary', () => {
  it('adds up the meter strip', () => {
    const forms = [form({ monthCount: 10, counts: { inbox: 1, spam: 4, held: 0, starred: 0, total: 5 } }), form({ id: 'f2', monthCount: 5, counts: { inbox: 0, spam: 1, held: 0, starred: 0, total: 1 } })];
    const s = rackSummary(forms, { f1: { count: 2, more: false }, f2: { count: 1, more: true } }, me, email());
    expect(s).toMatchObject({ formCount: 2, monthTotal: 15, unreadTotal: 3, unreadMore: true, spamTotal: 5, spamRetentionDays: 14, emailLoaded: true, byok: false });
    expect(s).toMatchObject({ emailsToday: 85, emailLimit: 100, emailPct: 85, emailsLeft: 15 });
  });

  it('holds back the spam total until every form has counts', () => {
    expect(rackSummary([form({ counts: { inbox: 0, spam: 1, held: 0, starred: 0, total: 1 } }), form({ id: 'f2' })], {}, me, null).spamTotal).toBeNull();
  });

  it('falls back before settings load, and knows your own key is uncapped', () => {
    const s = rackSummary([], {}, null, null);
    expect(s).toMatchObject({ perFormLimit: 1000, spamRetentionDays: 30, emailLoaded: false, emailLimit: 0, emailPct: 0 });
    expect(rackSummary([], {}, me, email({ byok: { configured: true, healthy: true } as EmailSettingsDto['byok'] })).byok).toBe(true);
  });
});

describe('todayLabel', () => {
  it('reads like a postmark date', () => {
    expect(todayLabel(new Date(2026, 8, 14))).toBe('Mon 14 Sep');
  });
});
