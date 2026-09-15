/** Pure helpers for the submission list: row chips, ordering, keyboard movement and bulk copy. */
import type { Submission } from '../../../lib/api/types';

/** Bulk "not spam" delivers at most this many never-delivered submissions per call (API rule). */
export const BULK_RESCUE_MAX = 25;

export const byNewest = (a: Submission, b: Submission) => b.createdAt - a.createdAt || b.id.localeCompare(a.id);

export const plural = (n: number) => (n === 1 ? '1 submission' : `${n} submissions`);

export type ChipTone = 'chip-spam' | 'chip-held';

/** The one status chip a row shows, most important first. */
export function rowChip(s: Submission): { text: string; cls: ChipTone } | null {
  if (s.status === 'spam') return { text: `Spam ${s.spamScore.toFixed(2)}`, cls: 'chip-spam' };
  if (s.status === 'held') return { text: 'Held', cls: 'chip-held' };
  if (s.status === 'pending_challenge') return { text: 'Captcha', cls: 'chip-held' };
  if (s.deliveries.some((d) => d.status === 'failed')) return { text: 'Delivery failed', cls: 'chip-held' };
  if (s.deliveries.some((d) => d.status === 'retrying')) return { text: 'Retrying', cls: 'chip-held' };
  return null;
}

/**
 * Where j/k (or the arrows) land: one step from the active row, clamped to the list.
 * With nothing active, down starts at the top and up at the bottom. -1 for an empty list.
 */
export function stepIndex(ids: string[], activeId: string | null, delta: number) {
  if (!ids.length) return -1;
  const from = activeId && ids.includes(activeId) ? ids.indexOf(activeId) : -1;
  return from === -1 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, from + delta));
}

/** Toast after bulk "not spam": how many went back, how many got queued, and what was left out. */
export function rescueMessage(n: number, undelivered: number, heldNote: string) {
  const queued = Math.min(undelivered, BULK_RESCUE_MAX);
  return `Moved ${plural(n)} back to the inbox${queued ? ` and queued ${queued === 1 ? '1' : queued} for delivery` : ''}.${
    undelivered > BULK_RESCUE_MAX ? ` Only ${BULK_RESCUE_MAX} are delivered per go, so the rest stay undelivered.` : ''
  }${heldNote}`;
}

/** Toast after "Retry now". */
export function retryMessage(failed: number) {
  return failed ? `Tried again. ${failed === 1 ? '1 delivery still failed' : `${failed} deliveries still failed`}.` : 'Tried again. Everything went through.';
}
