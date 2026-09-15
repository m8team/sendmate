/** Turns API errors into short, friendly inline copy. The API's own `message` is the fallback. */
import { isApiError } from './client';

const COPY: Record<string, string> = {
  network: 'Couldn’t reach sendm8. Check your connection and try again.',
  unauthorized: 'Your session has ended. Sign in again to carry on.',
  account_suspended: 'This account has been suspended. Email abuse@sendm8.com if you think that’s a mistake.',
  bad_origin: 'That request was blocked because it didn’t come from the dashboard. Reload the page and try again.',
  rate_limited: 'Slow down a little. Try again in a minute.',
  not_found: 'That’s not here any more. It may have been deleted.',
  form_limit_reached: 'You’ve hit the maximum number of forms. Delete one you don’t use to make room.',
  status_locked: 'This form’s status can’t be changed right now.',
  held_for_review: 'Held submissions can’t be moved to the inbox or spam. Delete it if it isn’t yours.',
  channel_limit_reached: 'This form already has the maximum number of channels. Remove one first.',
  channel_exists: 'This form already sends there.',
  recipient_unverified: 'That address hasn’t been verified yet. Click the link we emailed it, then try again.',
  instant_limit_reached: 'You’ve used today’s instant emails. Add your own Resend key to go unlimited.',
  email_exists: 'That address is already on your account.',
  email_limit_reached: 'You’ve added the maximum number of email addresses. Remove one first.',
  email_budget_exhausted: 'We’ve hit today’s email limit, so the verification email didn’t go out. Try again tomorrow.',
  email_send_failed: 'We couldn’t send the verification email. Try again shortly.',
  resend_cooldown: 'We just sent one. Check that inbox (and its spam folder) before asking again.',
  already_verified: 'That address is already verified.',
  turnstile_secret_invalid: 'Cloudflare didn’t accept that Turnstile secret key. Check you copied the secret, not the site key.',
  turnstile_unavailable: 'Couldn’t reach Cloudflare to check the key. Try again shortly.',
  PROVIDER_NOT_FOUND: 'That sign-in option isn’t set up on this server yet.',
  nothing_to_retry: 'Nothing to retry: every delivery for this one already went through.',
  not_deliverable: 'Only inbox submissions can be delivered. Move it out of spam first.',
  resend_not_configured: 'Add a Resend API key first.',
  resend_unavailable: 'Couldn’t reach Resend just now. Try again shortly.',
  cannot_suspend_self: 'You can’t suspend yourself.',
};

/** Codes whose API message carries the useful detail (e.g. what Discord or Resend said). */
const PASS_THROUGH = new Set(['channel_invalid', 'test_failed', 'resend_key_invalid']);

export interface FieldError {
  /** The request field that failed, e.g. `webhookUrl` or `settings.honeypotField`. */
  field: string | null;
  message: string;
}

const sentence = (s: string) => {
  const t = s.trim();
  if (!t) return t;
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?)]$/.test(cap) ? cap : `${cap}.`;
};

/** Splits a `validation_failed` message like `webhookUrl: must be a Discord webhook URL`. */
export function splitValidation(message: string): FieldError {
  const m = message.match(/^([\w.[\]]+): (.+)$/s);
  if (!m) return { field: null, message: sentence(message) };
  return { field: m[1], message: sentence(m[2]) };
}

export function errorCode(err: unknown): string | null {
  return isApiError(err) ? err.code : null;
}

export function friendlyError(err: unknown): string {
  if (!isApiError(err)) return 'Something went wrong. Try again.';
  if (PASS_THROUGH.has(err.code)) return sentence(err.message);
  if (err.code === 'validation_failed') return splitValidation(err.message).message;
  return COPY[err.code] ?? (err.message ? sentence(err.message) : 'Something went wrong. Try again.');
}

/** Like friendlyError, but also says which field was at fault when the API tells us. */
export function fieldError(err: unknown): FieldError {
  if (isApiError(err) && err.code === 'validation_failed') return splitValidation(err.message);
  return { field: null, message: friendlyError(err) };
}
