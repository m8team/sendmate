/**
 * Pure rules behind the form settings draft: what a fresh draft looks like, how each field is
 * validated, and which tab and input an error belongs to.
 */
import type { SettingsDraft } from '../../../lib/api/adapters';
import type { Form, TurnstileMode } from '../../../lib/api/types';
import { isDomain } from '../SettingsChannelRules';
import type { TabId } from './settingsTabs';

export type SettingsErrors = { name?: string; redirect?: string; domain?: string; honeypot?: string; secret?: string; general?: string };
export type ErrorKey = Exclude<keyof SettingsErrors, 'general'>;

export const errorTab: Record<ErrorKey, TabId> = { name: 'general', redirect: 'general', domain: 'general', honeypot: 'spam', secret: 'spam' };
export const errorField: Record<ErrorKey, string> = { name: 'fs-name', redirect: 'fs-redirect', domain: 'fs-domain', honeypot: 'fs-honeypot', secret: 'fs-secret' };
export const errorKeys = Object.keys(errorTab) as ErrorKey[];

export const MAX_ALLOWED_DOMAINS = 10;

export const draftFromForm = (f: Form): SettingsDraft => ({
  name: f.name,
  redirectUrl: f.redirectUrl ?? '',
  allowedOrigins: [...f.allowedOrigins],
  notify: f.notify,
  honeypotField: f.honeypotField,
  turnstile: f.turnstile,
  turnstileSecret: '',
  aiSpamScoring: f.aiSpamScoring,
});

export function validateName(name: string): string | undefined {
  const n = name.trim();
  if (!n) return 'A form needs a name, even a silly one.';
  return n.length > 100 ? 'Keep it under 100 characters.' : undefined;
}

const HONEYPOT_RE = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;

export function validateHoneypot(field: string): string | undefined {
  const hp = field.trim();
  if (!hp) return undefined;
  return HONEYPOT_RE.test(hp) ? undefined : 'Start with a letter, then letters, numbers, dashes or underscores. For example website_url.';
}

export function validateTurnstileSecret(mode: TurnstileMode, secret: string, hasStoredSecret: boolean): string | undefined {
  if (mode !== 'byo') return undefined;
  const s = secret.trim();
  if (!s && !hasStoredSecret) return 'Paste your Turnstile secret key, or pick another mode.';
  if (s && !/^0x[\w-]{20,}$/.test(s)) return 'Turnstile secret keys start with 0x and are about 35 characters long. Check you copied the secret, not the site key.';
  return undefined;
}

/** Why an (already normalised) domain can't join the allowed list, or undefined if it can. */
export function domainError(domain: string, allowed: string[]): string | undefined {
  if (!domain) return 'Type a domain first, like example.com.';
  if (!isDomain(domain)) return `“${domain}” doesn’t look like a domain. Just the hostname, e.g. example.com.`;
  if (allowed.includes(domain)) return `${domain} is already on the list.`;
  if (allowed.length >= MAX_ALLOWED_DOMAINS) return 'That’s ten already, the most a form can have.';
  return undefined;
}

const API_FIELDS: Record<string, ErrorKey> = { name: 'name', redirectUrl: 'redirect', allowedOrigins: 'domain', 'settings.honeypotField': 'honeypot', secretKey: 'secret' };

/** Which settings field an API validation error belongs to. */
export function errorKeyForApiField(field: string | null): ErrorKey | null {
  if (!field) return null;
  return API_FIELDS[field] ?? (field.startsWith('allowedOrigins') ? 'domain' : null);
}
