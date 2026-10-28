// The container's Wrangler config, derived from the repo's wrangler.jsonc so the two can't drift apart.
// Differences: no Workers AI binding (it only runs on Cloudflare, and the spam check skips itself when
// it's missing), no observability block (no Cloudflare dashboard to send logs to), and absolute paths,
// because the config is written outside the app directory along with the secrets.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * When a cron from triggers.crons is due, for the shapes sendm8 uses: "*\/N * * * *" and "M * * * *".
 * Anything else throws, so a new schedule can't silently never run in Docker.
 */
export function cronMatcher(cron) {
  const [minute, ...rest] = cron.trim().split(/\s+/);
  if (rest.length !== 4 || rest.some((f) => f !== '*')) throw new Error(`docker/server.mjs can't run cron "${cron}" yet`);
  const every = minute.match(/^\*\/(\d+)$/);
  if (every) return (date) => date.getUTCMinutes() % Number(every[1]) === 0;
  if (/^\d+$/.test(minute)) return (date) => date.getUTCMinutes() === Number(minute);
  throw new Error(`docker/server.mjs can't run cron "${cron}" yet`);
}

export function dockerConfig(appDir) {
  // wrangler.jsonc only uses whole-line // comments; strip those and parse the rest as JSON.
  const source = readFileSync(join(appDir, 'wrangler.jsonc'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  const config = JSON.parse(source);

  delete config.ai;
  delete config.observability;
  delete config.$schema;
  config.main = resolve(appDir, config.main);
  config.assets.directory = resolve(appDir, config.assets.directory);
  for (const db of config.d1_databases) db.migrations_dir = resolve(appDir, db.migrations_dir);
  return config;
}
