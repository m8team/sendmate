/**
 * Plus addressing: `kim+folio@gmail.com` lands in `kim@gmail.com`'s inbox, so whoever owns the base
 * address owns every `+tag` variant too. Never the other way round: owning a tagged address proves
 * nothing about the base one.
 */

/** `Kim+Folio@Gmail.com` → `kim@gmail.com`. Addresses without a tag come back lowercased. */
export function plusBase(email: string): string {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0) return lower;
  const plus = lower.indexOf("+");
  return plus > 0 && plus < at ? lower.slice(0, plus) + lower.slice(at) : lower;
}

/** True when mail to `address` reaches the owner of `owner`: the same address, or a `+tag` of it. */
export function reachesInboxOf(address: string, owner: string): boolean {
  const o = owner.trim().toLowerCase();
  const a = address.trim().toLowerCase();
  if (a === o) return true;
  // A tagged owner address doesn't own its siblings: kim+a@ can't claim kim+b@.
  return plusBase(o) === o && plusBase(a) === o;
}

/** Tagged variants of `email` as a LIKE pattern, `ESCAPE '!'`. Null for an address that's already tagged. */
export function plusVariantsPattern(email: string): string | null {
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf("@");
  if (at <= 0 || plusBase(lower) !== lower) return null;
  const escape = (s: string) => s.replace(/[!%_]/g, (c) => `!${c}`);
  return `${escape(lower.slice(0, at))}+%${escape(lower.slice(at))}`;
}
