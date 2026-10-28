// Runs sendm8 in a container: the Worker in workerd (via `wrangler dev` in local mode), D1 and R2 kept on
// disk under DATA_DIR, Cloudflare's cron triggers replaced by a timer, and a small proxy in front.
//
// The proxy is the only thing listening publicly. It hides wrangler's /cdn-cgi/ routes (including the cron trigger)
// (anyone could otherwise trigger the cron jobs), and it sets CF-Connecting-IP from the real client,
// because the Worker rate-limits by that header and a client must not be able to choose its own.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cronMatcher, dockerConfig } from './make-config.mjs';

const APP = process.env.APP_DIR ?? process.cwd();
const DATA = process.env.DATA_DIR ?? '/data';
const PORT = Number(process.env.PORT ?? 8787);
const INNER = Number(process.env.INNER_PORT ?? 8788);
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY ?? '');
// Config and secrets live outside the app (and outside the data volume), rebuilt on every start.
const RUNTIME = process.env.RUNTIME_DIR ?? join(tmpdir(), 'sendm8-runtime');
const CONFIG = join(RUNTIME, 'wrangler.json');
const STATE = join(DATA, 'state');

/** Every setting the Worker reads (see .dev.vars.example). */
const SETTINGS = [
  'APP_URL', 'BETTER_AUTH_SECRET', 'IP_HASH_SECRET', 'ENCRYPTION_KEY', 'EMAIL_FROM', 'RESEND_API_KEY',
  'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ADMIN_EMAILS',
  'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'ALERT_WEBHOOK_URL', 'LIMITS_JSON',
];
const REQUIRED = ['APP_URL', 'BETTER_AUTH_SECRET', 'IP_HASH_SECRET', 'ENCRYPTION_KEY'];

const log = (...args) => console.log('[sendm8]', ...args);

function writeSettings() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[sendm8] Missing required settings: ${missing.join(', ')}. See docs/self-hosting.md#docker.`);
    process.exit(1);
  }
  // wrangler dev reads secrets from .dev.vars beside the config. Double-quoted dotenv values, escaped.
  const quote = (v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  const lines = SETTINGS.filter((k) => process.env[k] !== undefined).map((k) => `${k}=${quote(process.env[k])}`);
  writeFileSync(join(RUNTIME, '.dev.vars'), `${lines.join('\n')}\n`, { mode: 0o600 });
}

function wrangler(args, opts = {}) {
  return [process.execPath, [join(APP, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--config', CONFIG], { cwd: RUNTIME, env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, ...opts }];
}

function migrate() {
  log('applying database migrations');
  const [cmd, args, opts] = wrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', STATE], { stdio: 'inherit' });
  const run = spawnSync(cmd, args, opts);
  if (run.status !== 0) {
    console.error('[sendm8] Migrations failed; not starting.');
    process.exit(1);
  }
}

function startWorker() {
  const [cmd, args, opts] = wrangler(
    [
      'dev', '--local', '--ip', '127.0.0.1', '--port', String(INNER), '--persist-to', STATE,
      '--test-scheduled', '--show-interactive-dev-session=false', '--log-level', process.env.LOG_LEVEL ?? 'warn',
    ],
    { stdio: 'inherit' },
  );
  const child = spawn(cmd, args, opts);
  child.on('exit', (code) => {
    console.error(`[sendm8] Worker exited (${code}); stopping.`);
    process.exit(code ?? 1);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  return child;
}

async function waitForWorker() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${INNER}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('the Worker didn’t answer /health within two minutes');
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
}

function startProxy() {
  const server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path.startsWith('/__scheduled') || path.startsWith('/cdn-cgi/')) {
      res.writeHead(404).end();
      return;
    }
    const headers = { ...req.headers, 'cf-connecting-ip': clientIp(req) };
    delete headers['x-forwarded-for'];
    const upstream = http.request({ host: '127.0.0.1', port: INNER, method: req.method, path: req.url, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  server.listen(PORT, '0.0.0.0', () => log(`listening on :${PORT}`));
}

/** Cloudflare runs these from wrangler.jsonc's triggers.crons; here a timer does, on the same schedule. */
function startScheduler(crons) {
  // Throws now, at start-up, for a schedule this timer can't follow.
  const jobs = crons.map((cron) => ({ cron, due: cronMatcher(cron) }));
  const run = async (cron) => {
    try {
      const res = await fetch(`http://127.0.0.1:${INNER}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent(cron)}`);
      if (!res.ok) console.error(`[sendm8] cron ${cron} answered ${res.status}`);
    } catch (error) {
      console.error(`[sendm8] cron ${cron} failed:`, error.message);
    }
  };
  const tick = () => {
    const now = new Date();
    for (const job of jobs) if (job.due(now)) void run(job.cron);
  };
  // Line up with the start of each minute, like Cloudflare does.
  setTimeout(() => {
    tick();
    setInterval(tick, 60_000);
  }, 60_000 - (Date.now() % 60_000));
}

mkdirSync(STATE, { recursive: true });
mkdirSync(RUNTIME, { recursive: true });
const config = dockerConfig(APP);
// Refuse to start with a cron schedule the timer below can't follow.
for (const cron of config.triggers?.crons ?? []) cronMatcher(cron);
writeFileSync(CONFIG, JSON.stringify(config, null, 2));
writeSettings();
migrate();
startWorker();
await waitForWorker();
startProxy();
startScheduler(config.triggers?.crons ?? []);
log('ready');
