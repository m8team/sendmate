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

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Scores at or above this send browser submissions through the Turnstile challenge (when enabled). */
export const SUSPICIOUS_SCORE = 0.35;

export function assessSpam(parsed: ParsedSubmission, settings: FormSettings, opts: { reviewed?: boolean } = {}): SpamVerdict {
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

  score = Math.min(1, Math.round(score * 100) / 100);
  return { status: score >= 0.8 ? "spam" : "ok", score, reasons, drop: false };
}
