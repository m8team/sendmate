// wrangler.jsonc's LIMITS_JSON var, read at build time so the pages quote the limits the Worker enforces.
// wrangler.jsonc only uses whole-line // comments; strip those and parse the rest as JSON.
import { readFileSync } from 'node:fs';

/** @returns {string} */
export function wranglerLimitsJson() {
  const source = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  return JSON.parse(source).vars?.LIMITS_JSON ?? '';
}
