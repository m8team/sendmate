/** UTC day key, e.g. `2026-09-14`. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** UTC day key for the first day of the month containing `ms`. */
export function monthStartKey(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 7)}-01`;
}
