/** Pure rules for the admin back room: usage tiles, report tags and blocklist checks. */
import type { AdminReportDto, AdminUsageDto, BlocklistEntryDto, ErrorGroupDto } from '@sendm8/shared';
import { formatBytes, percent } from '../../../lib/api/adapters';

/** Cloudflare D1 free plan: rows written per day. */
export const D1_DAILY_WRITES = 100_000;

export interface UsageTile {
  key: string;
  label: string;
  value: string;
  /** "/100k" style cap, or '' when there isn't one. */
  of: string;
  pct: number | null;
  note: string;
}

export function usageTiles(u: AdminUsageDto): UsageTile[] {
  return [
    { key: 'subs', label: 'Submissions today', value: u.submissions.toLocaleString('en-GB'), of: '', pct: null, note: `UTC day ${u.day}` },
    {
      key: 'writes',
      label: 'D1 writes (estimate)',
      value: u.estimatedWrites.toLocaleString('en-GB'),
      of: `/${(D1_DAILY_WRITES / 1000).toLocaleString('en-GB')}k`,
      pct: percent(u.estimatedWrites, D1_DAILY_WRITES),
      note: 'Free plan: 100,000 rows written a day. Load shedding starts at 90%.',
    },
    {
      key: 'email',
      label: 'System emails',
      value: u.systemEmails.toLocaleString('en-GB'),
      of: `/${u.systemEmailLimit.toLocaleString('en-GB')}`,
      pct: percent(u.systemEmails, u.systemEmailLimit),
      note: 'Everything sent through our own Resend key today.',
    },
    {
      key: 'storage',
      label: 'File storage',
      value: formatBytes(u.storageBytes),
      of: `/${formatBytes(u.storageLimitBytes)}`,
      pct: percent(u.storageBytes, u.storageLimitBytes),
      note: 'Uploads across every account, against the R2 cap.',
    },
    {
      key: 'database',
      label: 'Database size',
      value: u.databaseBytes === null ? '—' : formatBytes(u.databaseBytes),
      of: `/${formatBytes(u.databaseLimitBytes)}`,
      pct: u.databaseBytes === null ? null : percent(u.databaseBytes, u.databaseLimitBytes),
      note:
        u.databaseBytes === null
          ? 'D1 didn’t report a size just now. Try again shortly.'
          : 'D1 stops accepting writes when full. Set submissionRetentionDays before it gets there.',
    },
  ];
}

export const errorSourceLabel: Record<ErrorGroupDto['source'], string> = { worker: 'Worker', browser: 'Browser' };

/** Context worth reading first, in this order. Anything else follows alphabetically. */
const CONTEXT_ORDER = ['where', 'route', 'page', 'path', 'method', 'component', 'info', 'browser', 'kind'];

export function errorContext(context: ErrorGroupDto['context']): [string, string][] {
  const rank = (key: string) => (CONTEXT_ORDER.includes(key) ? CONTEXT_ORDER.indexOf(key) : CONTEXT_ORDER.length);
  return Object.entries(context)
    .filter(([, value]) => value)
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

/** "Seen 1,204 times" / "Seen once". */
export const occurrences = (count: number) => (count === 1 ? 'Seen once' : `Seen ${count.toLocaleString('en-GB')} times`);

/** Meter fill: anything above zero shows at least a sliver. */
export const meterPct = (pct: number) => Math.max(pct, pct > 0 ? 2 : 0);

export const reasonTag: Record<AdminReportDto['reason'], string> = { phishing: 'tag-signal', malware: 'tag-signal', spam: 'tag-warn', impersonation: 'tag-warn', other: '' };
export const formStatusTag: Record<string, string> = { active: 'tag-ok', paused: '', pending_confirmation: 'tag-warn', disabled: 'tag-signal' };

/** The reason box starts with the report's reason, unless it's just "other". */
export const disableReasonFor = (r: Pick<AdminReportDto, 'reason'>) => (r.reason === 'other' ? '' : r.reason);

export type BlockType = 'ip' | 'email' | 'email_domain';

export const blockTypes: { value: BlockType; label: string; placeholder: string }[] = [
  { value: 'email', label: 'Email address', placeholder: 'spammer@example.com' },
  { value: 'email_domain', label: 'Email domain', placeholder: 'example.com' },
  { value: 'ip', label: 'IP address', placeholder: '203.0.113.7' },
];

export const blockTypeLabel: Record<BlocklistEntryDto['type'], string> = { ip_hash: 'IP (hashed)', email: 'Email', email_domain: 'Domain', user: 'User' };

/** Why a blocklist entry can't be added, or '' if it looks fine. */
export function validateBlock(type: BlockType, value: string) {
  const v = value.trim();
  if (!v) return 'Type what to block.';
  if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'That doesn’t look like an email address.';
  if (type === 'email_domain' && !/^@?([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v)) return 'Just the domain, like example.com.';
  if (type === 'ip' && !/^[0-9a-f:.]{3,45}$/i.test(v)) return 'That doesn’t look like an IP address.';
  return '';
}

/** Checks the suspend form. Lifting a suspension only needs the id. */
export function validateSuspension(id: string, reason: string | null) {
  if (!id.trim()) return 'Paste the user id.';
  if (reason !== null && !reason.trim()) return 'Give a reason. It’s stored with the suspension and shown on their forms.';
  return '';
}
