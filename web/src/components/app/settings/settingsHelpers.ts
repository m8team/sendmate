/** Small pure helpers for the settings panels: snippets, usage maths and status copy. */
import type { FormStatus } from '../../../lib/api/types';

/** The hidden `_subject` field people paste into their form. */
export const subjectSnippet = (formName: string) => `<input type="hidden" name="_subject" value="New message from ${formName}">`;

/** The hidden honeypot input, using the custom name when there is one. */
export const honeypotSnippet = (field: string) =>
  `<input type="text" name="${field.trim() || '_gotcha'}" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">`;

const RISKY = /pass(word|wd)?|cvv|cvc|card.?number|ssn|seed.?phrase|mnemonic|pin$/i;

/** Field names the phishing guard holds submissions for. */
export const riskyFields = (names: string[] | null) => (names ?? []).filter((f) => RISKY.test(f));

/** True when a form has a field we can use as the notification's Reply-To. */
export const hasReplyToField = (names: string[] | null) => names?.some((f) => f === 'email' || f === 'replyto');

/** Whole-number percentage of a daily cap, clamped to 100 (a zero cap counts as one). */
export const usagePct = (used: number, limit: number) => Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

/** "1 submission" / "1,234 submissions", or '' before the counts have loaded. */
export function submissionsLabel(total: number | undefined) {
  if (total === undefined) return '';
  return total === 1 ? '1 submission' : `${total.toLocaleString('en-GB')} submissions`;
}

/** The tag next to "Pause form" / "Resume form". */
export function statusTag(status: FormStatus): { cls: string; text: string } {
  if (status === 'paused') return { cls: 'tag tag-warn', text: 'Paused' };
  if (status === 'active') return { cls: 'tag tag-ok', text: 'Accepting post' };
  return { cls: 'tag tag-plain', text: status === 'disabled' ? 'Switched off' : 'Awaiting confirmation' };
}

/** Pending and disabled forms can't be paused or resumed from settings. */
export const statusLocked = (status: FormStatus) => status === 'pending_confirmation' || status === 'disabled';

export function pauseDescription(status: FormStatus) {
  if (statusLocked(status)) return 'This form’s status can’t be changed from here right now.';
  return status === 'paused'
    ? 'Right now new submissions are turned away with a “paused” error and nothing is stored. Resume to open it back up.'
    : 'Stop accepting submissions without deleting anything. Visitors get a polite “paused” error. Undo any time.';
}
