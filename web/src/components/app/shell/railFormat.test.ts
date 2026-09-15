import { describe, expect, it } from 'vitest';
import type { EmailSettingsDto } from '@sendm8/shared';
import { unreadBadge, usageReading } from './railFormat';

const settings = (today: number, limit: number, byok = { configured: false, healthy: false }) =>
  ({ byok, usage: { instantToday: today, instantLimit: limit } }) as unknown as Pick<EmailSettingsDto, 'byok' | 'usage'>;

describe('unreadBadge', () => {
  it('hides at zero and says "or more" when capped', () => {
    expect(unreadBadge(0)).toEqual({ hidden: true, text: '0', label: '0 unread' });
    expect(unreadBadge(100, true)).toEqual({ hidden: false, text: '100+', label: '100 or more unread' });
  });
});

describe('usageReading', () => {
  it('reads today against the allowance', () => {
    expect(usageReading(settings(12, 100))).toEqual({ text: '12/100', pct: 12, high: false });
    expect(usageReading(settings(95, 100))).toEqual({ text: '95/100', pct: 95, high: true });
    expect(usageReading(settings(5, 0)).pct).toBe(100);
  });

  it('is uncapped on a healthy key of your own', () => {
    expect(usageReading(settings(500, 100, { configured: true, healthy: true }))).toEqual({ text: 'Your key · ∞', pct: 0, high: null });
    expect(usageReading(settings(50, 100, { configured: true, healthy: false })).text).toBe('50/100');
  });
});
