/** Pure view logic for the sorting rack (/app): the franking-meter numbers and one row per pigeonhole. */
import type { EmailSettingsDto, MeDto } from '@sendm8/shared';
import type { Form } from '../../../lib/api/types';
import { emailAddressOf, usagePct } from '../inbox/formStatus';
import { hourLabel } from '../SettingsChannelRules';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface UnreadCount {
  count: number;
  more: boolean;
}

export interface RackRow {
  f: Form;
  /** "01", "02"… the pigeonhole number. */
  no: string;
  unread: number;
  /** "3", "100+", or '' until the count has loaded. */
  unreadLabel: string;
  pct: number;
  href: string;
  /** Screen-reader description of the sparkline. */
  spark: string;
  address: string | null;
}

export const fmtN = (n: number) => n.toLocaleString('en-GB');

/** "Mon 14 Sep", in the browser's own time zone. */
export const todayLabel = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

export const slotNo = (i: number) => String(i + 1).padStart(2, '0');

/** Last seven days against the seven before. */
export function trendWord(daily: number[]) {
  const recent = daily.slice(-7).reduce((a, b) => a + b, 0);
  const before = daily.slice(-14, -7).reduce((a, b) => a + b, 0);
  if (recent === 0 && before === 0) return 'flat, nothing in the last two weeks';
  if (recent > before * 1.15) return 'rising';
  if (recent < before * 0.85) return 'falling';
  return 'steady';
}

export function rackRows(forms: Form[], unread: Record<string, UnreadCount>): RackRow[] {
  return forms.map((f, i) => {
    const u = unread[f.id];
    const peak = f.daily.length ? Math.max(...f.daily) : 0;
    return {
      f,
      no: slotNo(i),
      unread: u?.count ?? 0,
      unreadLabel: u ? `${u.count}${u.more ? '+' : ''}` : '',
      pct: usagePct(f.monthCount, f.monthlyLimit),
      href: `/app/forms/${f.id}`,
      spark: `30-day trend, ${fmtN(f.monthCount)} this month, busiest day ${peak}, ${trendWord(f.daily)}.`,
      address: emailAddressOf(f.emailEndpoint) ?? null,
    };
  });
}

export interface RackSummary {
  formCount: number;
  perFormLimit: number;
  monthTotal: number;
  unreadTotal: number;
  unreadMore: boolean;
  /** Null until every form's counts have arrived, so the tile never shows a half-sum. */
  spamTotal: number | null;
  spamRetentionDays: number;
  /** False until email settings have loaded. */
  emailLoaded: boolean;
  byok: boolean;
  emailsToday: number;
  emailLimit: number;
  emailPct: number;
  emailsLeft: number;
  digestHour: string;
}

export function rackSummary(forms: Form[], unread: Record<string, UnreadCount>, me: MeDto | null, email: EmailSettingsDto | null): RackSummary {
  const counts = Object.values(unread);
  const emailsToday = email?.usage.instantToday ?? 0;
  const emailLimit = email?.usage.instantLimit ?? me?.limits.instantEmailsPerUserPerDay ?? 0;
  return {
    formCount: forms.length,
    perFormLimit: me?.limits.submissionsPerFormPerMonth ?? forms[0]?.monthlyLimit ?? 1000,
    monthTotal: forms.reduce((sum, f) => sum + f.monthCount, 0),
    unreadTotal: counts.reduce((sum, u) => sum + u.count, 0),
    unreadMore: counts.some((u) => u.more),
    spamTotal: forms.every((f) => f.counts) ? forms.reduce((sum, f) => sum + (f.counts?.spam ?? 0), 0) : null,
    spamRetentionDays: me?.limits.spamRetentionDays ?? 30,
    emailLoaded: !!email,
    byok: Boolean(email?.byok.configured && email.byok.healthy),
    emailsToday,
    emailLimit,
    emailPct: emailLimit ? Math.min(100, Math.round((emailsToday / emailLimit) * 100)) : 0,
    emailsLeft: Math.max(0, emailLimit - emailsToday),
    digestHour: hourLabel(email?.digestHourUtc ?? me?.limits.digestHourUtc ?? 18),
  };
}
