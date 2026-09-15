/** Pure text for the dashboard rail: pigeonhole unread badges and the "Emails today" meter. */
import type { EmailSettingsDto } from '@sendm8/shared';

/** The red count on a pigeonhole. Hidden at zero. */
export function unreadBadge(count: number, more = false) {
  return {
    hidden: count === 0,
    text: `${count}${more ? '+' : ''}`,
    label: `${count}${more ? ' or more' : ''} unread`,
  };
}

/** What the rail's email meter reads: your own key is uncapped, otherwise today's use against the allowance. */
export function usageReading(s: Pick<EmailSettingsDto, 'byok' | 'usage'>): { text: string; pct: number; high: boolean | null } {
  if (s.byok.configured && s.byok.healthy) return { text: 'Your key · ∞', pct: 0, high: null };
  const pct = Math.min(100, Math.round((s.usage.instantToday / Math.max(1, s.usage.instantLimit)) * 100));
  return { text: `${s.usage.instantToday}/${s.usage.instantLimit}`, pct, high: pct > 80 };
}
