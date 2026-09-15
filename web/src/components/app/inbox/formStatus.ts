/** Pure helpers for how a form's status and monthly usage read, shared by the inbox and the rack. */
import type { FormStatus } from '../../../lib/api/types';

/** The status tag next to a form's name. */
export function formStatusTag(status: FormStatus): { text: string; cls: string } {
  switch (status) {
    case 'active':
      return { text: 'Active', cls: 'tag-ok' };
    case 'paused':
      return { text: 'Paused', cls: '' };
    case 'pending_confirmation':
      return { text: 'Awaiting confirmation', cls: 'tag-warn' };
    default:
      return { text: 'Disabled', cls: 'tag-signal' };
  }
}

/** Whole-number percentage of the monthly limit used, capped at 100. */
export const usagePct = (count: number, limit: number) => Math.min(100, Math.round((count / Math.max(1, limit)) * 100));

/** The address part of a `/f/you@example.com` endpoint. */
export const emailAddressOf = (emailEndpoint: string | null | undefined) => emailEndpoint?.split('/f/')[1];
