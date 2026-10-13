import { readFileSync } from 'node:fs';
import { SECURITY_HEADERS } from '@sendm8/shared';
import { describe, expect, it } from 'vitest';

/** The `/*` block of public/_headers, as name → value. */
function staticHeaders(): Record<string, string> {
  const file = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  const headers: Record<string, string> = {};
  let inBlock = false;
  for (const line of file.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inBlock = line.trim() === '/*';
      continue;
    }
    if (!inBlock) continue;
    const at = line.indexOf(':');
    headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return headers;
}

describe('public/_headers', () => {
  it('sends the same security headers as the Worker', () => {
    expect(staticHeaders()).toEqual(SECURITY_HEADERS);
  });
});
