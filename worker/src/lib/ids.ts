import { encodeTime, ulid } from "ulidx";

// Crockford-style lowercase base32 (no i, l, o, u). 32 symbols, so `byte & 31` is unbiased.
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export function randomId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte & 31];
  return out;
}

/** Public form id used in endpoint URLs, e.g. `k3x9q2m7ab`. */
export const newFormId = () => randomId(10);

/** Time-sortable id for rows that are paginated (submissions, channels…). */
export const newId = () => ulid().toLowerCase();

export const FORM_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{10}$/;

/** The smallest (lowercased) ULID for a given time, for id-range queries like "older than". */
export function ulidFloor(ms: number): string {
  return `${encodeTime(Math.max(0, Math.floor(ms)), 10)}${"0".repeat(16)}`.toLowerCase();
}
