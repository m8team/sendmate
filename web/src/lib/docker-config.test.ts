import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cronMatcher, dockerConfig } from '../../../docker/make-config.mjs';

// The Docker image derives its Wrangler config from wrangler.jsonc at start-up, and runs the cron
// triggers on its own timer. These keep the two in step.
const root = fileURLToPath(new URL('../../../', import.meta.url));

describe('docker config', () => {
  const config = dockerConfig(root);

  it('keeps every binding except Workers AI, which only runs on Cloudflare', () => {
    expect(config.ai).toBeUndefined();
    expect(config.d1_databases[0].binding).toBe('DB');
    expect(config.r2_buckets[0].binding).toBe('FILES');
    expect(config.ratelimits.length).toBeGreaterThan(0);
  });

  it('uses absolute paths, since it is written outside the app directory', () => {
    expect(isAbsolute(config.main)).toBe(true);
    expect(isAbsolute(config.assets.directory)).toBe(true);
    expect(isAbsolute(config.d1_databases[0].migrations_dir)).toBe(true);
  });

  it('can run every cron trigger in wrangler.jsonc', () => {
    expect(config.triggers.crons.length).toBeGreaterThan(0);
    for (const cron of config.triggers.crons) expect(() => cronMatcher(cron)).not.toThrow();
  });
});

describe('cronMatcher', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 9, 28, 13, minute));

  it('follows "every N minutes" and "at minute M"', () => {
    const everyFive = cronMatcher('*/5 * * * *');
    expect([0, 5, 55].map((m) => everyFive(at(m)))).toEqual([true, true, true]);
    expect([1, 4, 59].map((m) => everyFive(at(m)))).toEqual([false, false, false]);
    const hourly = cronMatcher('0 * * * *');
    expect(hourly(at(0))).toBe(true);
    expect(hourly(at(30))).toBe(false);
  });

  it('refuses schedules it would get wrong', () => {
    for (const cron of ['0 3 * * *', '*/5 * * * 1', '1-5 * * * *', 'nonsense']) expect(() => cronMatcher(cron), cron).toThrow();
  });
});
