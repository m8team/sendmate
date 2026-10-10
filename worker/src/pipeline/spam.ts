import type { FormSettings, SubmissionStatus } from "@sendm8/shared";
import type { ParsedSubmission } from "./parse";

export interface SpamVerdict {
  status: SubmissionStatus;
  score: number;
  reasons: string[];
  /**
   * Honeypot hits are near-certain bots: pretend success and don't store them,
   * so they never cost a D1 write.
   */
  drop: boolean;
}

/**
 * Field names that suggest a form is harvesting credentials or card details.
 * Names are normalised (lowercase, separators removed) before matching.
 */
const PHISHING_FIELDS = new Set([
  "password",
  "passwd",
  "pwd",
  "userpassword",
  "currentpassword",
  "cvv",
  "cvc",
  "cvv2",
  "cardnumber",
  "ccnumber",
  "ccnum",
  "creditcard",
  "creditcardnumber",
  "cardcvv",
  "ssn",
  "socialsecuritynumber",
  "seedphrase",
  "recoveryphrase",
  "secretphrase",
  "mnemonic",
  "privatekey",
  "walletphrase",
]);

const SPAM_PHRASES = [
  /\bcasino\b/i,
  /\bviagra\b|\bcialis\b/i,
  /\bseo (services?|agency|expert)\b/i,
  /\bbacklinks?\b/i,
  /\bguest post(ing)?\b/i,
  /\b(crypto|bitcoin|forex) (investment|trading|profit)/i,
  /\bescorts?\b|\bporn\b/i,
  /\bbuy (followers|likes|reviews)\b/i,
  /\bpayday loans?\b/i,
];

const URL_PATTERN = /\bhttps?:\/\/|\bwww\./gi;

/**
 * Throwaway inbox providers. Someone with a real question rarely writes from one, and bots often do.
 * It's a nudge, not a verdict: on its own it never reaches the spam line.
 */
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "burnermail.io",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "grr.la",
  "guerrillamail.com",
  "guerrillamail.info",
  "harakirimail.com",
  "inboxbear.com",
  "incognitomail.com",
  "jetable.org",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "mohmal.com",
  "moakt.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempmail.com",
  "tempmailo.com",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
]);

/** The throwaway provider behind an address, or null. Subdomains count (inbox.mailinator.com). */
export function disposableDomain(email: string | null | undefined): string | null {
  const domain = email?.split("@")[1]?.trim().toLowerCase().replace(/\.$/, "");
  if (!domain) return null;
  for (const known of DISPOSABLE_DOMAINS) {
    if (domain === known || domain.endsWith(`.${known}`)) return known;
  }
  return null;
}

/**
 * Keyboard mash ("asdkjhasdkjh"), as opposed to writing. Deliberately shy: it only judges longer,
 * mostly-Latin, mixed-case text, so other alphabets, short notes and SHOUTING acronyms are left alone.
 */
export function looksLikeGibberish(text: string): boolean {
  const trimmed = text.trim();
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  const solid = trimmed.replace(/\s/g, "");
  if (letters.length < 12 || letters.length / solid.length < 0.8) return false;
  if (letters.replace(/[^A-Z]/g, "").length / letters.length > 0.6) return false;

  const lower = letters.toLowerCase();
  const vowelRatio = (lower.match(/[aeiouy]/g)?.length ?? 0) / lower.length;
  const longestConsonantRun = Math.max(...(lower.match(/[^aeiouy]+/g) ?? [""]).map((run) => run.length));
  const words = trimmed.split(/\s+/);
  // Barely any vowels at all: no language reads like that.
  if (vowelRatio < 0.2) return true;

  // Consonant runs only count against all-lowercase text, the way mash is typed. Capitalised
  // compounds in other languages (German "Rechtsschutzversicherung") have the same shape and are real.
  if (letters !== letters.toLowerCase()) return false;
  if (vowelRatio < 0.3 && longestConsonantRun >= 6) return true;
  return words.length === 1 && letters.length >= 15 && longestConsonantRun >= 6 && vowelRatio < 0.4;
}

/** The address the submitter gave, from `_replyto` or an `email` field. */
export function submitterEmail(parsed: Pick<ParsedSubmission, "fields" | "special">): string | null {
  const candidate = parsed.special._replyto ?? parsed.fields.email;
  const value = (Array.isArray(candidate) ? candidate[0] : candidate)?.trim().toLowerCase();
  return value && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value : null;
}

/** A browser sent this, rather than a script. Any mainstream engine token will do. */
const fromBrowser = (userAgent: string | null | undefined) => /Mozilla|AppleWebKit|Gecko|Chrome|Safari|Firefox|Edg|OPR|Opera/i.test(userAgent ?? "");

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Scores at or above this send browser submissions through the Turnstile challenge (when enabled). */
export const SUSPICIOUS_SCORE = 0.35;

export interface RequestSignals {
  /** The page the form was on, if the browser sent one. */
  referrer?: string | null;
  userAgent?: string | null;
}

export function assessSpam(parsed: ParsedSubmission, settings: FormSettings, opts: { reviewed?: boolean } & RequestSignals = {}): SpamVerdict {
  const { fields, special } = parsed;

  // 1. Honeypots: the standard names plus the form's custom field.
  if (special._gotcha?.trim() || special._honeypot?.trim()) {
    return { status: "spam", score: 1, reasons: ["honeypot"], drop: true };
  }
  if (settings.honeypotField) {
    const value = fields[settings.honeypotField];
    delete fields[settings.honeypotField];
    const filled = Array.isArray(value) ? value.some((v) => v.trim()) : Boolean(value?.trim());
    if (filled) return { status: "spam", score: 1, reasons: ["honeypot"], drop: true };
  }

  // 2. Credential harvesting: hold, never notify.
  // Forms an admin has reviewed (e.g. a legitimate account-recovery form) skip this check.
  const phishingField = opts.reviewed ? undefined : Object.keys(fields).find((name) => PHISHING_FIELDS.has(normalise(name)));
  if (phishingField) {
    return { status: "held", score: 0, reasons: [`sensitive_field:${phishingField}`], drop: false };
  }

  // 3. Heuristics. Deliberately conservative: spam is stored and reviewable, false positives are not lost.
  const values = Object.values(fields).flat();
  const text = values.join("\n");
  const reasons: string[] = [];
  let score = 0;

  const urlCount = text.match(URL_PATTERN)?.length ?? 0;
  if (urlCount >= 3) {
    score += 0.35;
    reasons.push(`links:${urlCount}`);
  }
  if (urlCount >= 6) score += 0.3;

  if (/\[url=|\[\/url\]|<a\s+href=/i.test(text)) {
    score += 0.4;
    reasons.push("markup_links");
  }

  const phraseHits = SPAM_PHRASES.filter((pattern) => pattern.test(text)).length;
  if (phraseHits) {
    score += Math.min(0.5, phraseHits * 0.25);
    reasons.push(`phrases:${phraseHits}`);
  }

  const longest = values.reduce((a, b) => (b.length > a.length ? b : a), "");
  if (longest && /^\s*https?:\/\/\S+\s*$/i.test(longest)) {
    score += 0.3;
    reasons.push("url_only_message");
  }

  const disposable = disposableDomain(submitterEmail(parsed));
  if (disposable) {
    score += 0.25;
    reasons.push(`disposable_email:${disposable}`);
  }

  if (looksLikeGibberish(longest)) {
    score += 0.3;
    reasons.push("gibberish");
  }

  // Posted by a script: no browser user agent and no page it came from. Plenty of legitimate
  // server-to-server posts look like this, so it's only ever a nudge.
  if (!fromBrowser(opts.userAgent) && !opts.referrer) {
    score += 0.15;
    reasons.push("no_browser");
  }

  score = Math.min(1, Math.round(score * 100) / 100);
  return { status: score >= 0.8 ? "spam" : "ok", score, reasons, drop: false };
}
