/** Pure checks for the Email & BYOK page: Resend keys, sender addresses and recipients. */
import type { EmailAddressDto } from '@sendm8/shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Why a pasted Resend API key can't be right, or '' if it looks fine. */
export function checkKeyFormat(v: string) {
  if (!v) return 'Paste your key first. It starts with re_.';
  if (/\s/.test(v)) return 'There’s a space in there. Keys don’t have spaces, so something extra got copied.';
  if (!v.startsWith('re_')) return 'Resend API keys start with re_. Check you copied the key itself, not its name or id.';
  if (v.length < 11) return 'That’s too short to be a Resend key. Did the end get cut off?';
  if (!/^re_[A-Za-z0-9_-]+$/.test(v)) return 'That has characters Resend keys don’t use. Try copying it again.';
  return '';
}

/** Checks a from address, either `hello@domain.com` or `Name <hello@domain.com>`. */
export function checkFrom(v: string) {
  if (!v) return 'Which address should notifications come from? It has to be on a domain you’ve verified in Resend.';
  const m = v.match(/^(?:[^<>]{1,100}<([^<>]+)>|([^<>\s]+))$/);
  const address = (m?.[1] ?? m?.[2])?.trim() ?? '';
  if (!EMAIL_RE.test(address)) return 'Use an address like hello@yourdomain.com, or Your Name <hello@yourdomain.com>.';
  return '';
}

/** Checks the part before the @ in the verified-domain picker. */
export function checkLocalPart(v: string) {
  return /^[a-z0-9][a-z0-9._+-]{0,63}$/i.test(v.trim()) ? '' : 'Use letters, numbers, dots, dashes or plus signs before the @.';
}

/** Checks a recipient address typed into "Add an address". */
export function checkNewAddress(v: string) {
  if (!v) return 'Type the address you want notifications sent to.';
  if (!EMAIL_RE.test(v)) return 'That email doesn’t look quite right. Check for typos.';
  return '';
}

/** The address someone signed in with can't be removed. */
export const isAccountAddress = (a: Pick<EmailAddressDto, 'email'>, accountEmail: string | undefined) => a.email.toLowerCase() === accountEmail?.toLowerCase();

/** The steps shown while Resend checks a key. */
export const keyChecks = [
  { n: 1, text: 'Key looks like a Resend key' },
  { n: 2, text: 'Asking Resend who you are' },
  { n: 3, text: 'Checking your sending domain' },
];
