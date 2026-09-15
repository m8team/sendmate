# Self-hosting sendm8

sendm8 runs on a single Cloudflare Worker with D1 (database), R2 (file uploads) and Workers AI (spam scoring). Everything fits the **Cloudflare free plan**, though R2 asks for a card on file (see [File uploads](#file-uploads-r2)). The only paid thing you might want is Resend Pro, if you outgrow Resend's free 100 emails a day.

## One click

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/m8team/sendmate)

Cloudflare forks the repo into your GitHub account, creates the D1 database, asks for the settings below, builds the site, deploys, and runs the database migrations. Your instance comes up at `https://sendm8.<your-subdomain>.workers.dev`.

**What you'll be asked for:**
- **Required:** `BETTER_AUTH_SECRET`, `IP_HASH_SECRET` and `ENCRYPTION_KEY`. Generate each with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- **For sign-in:** a GitHub OAuth app (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`). Its callback is `{your URL}/api/auth/callback/github`.
- **For emails:** `RESEND_API_KEY` and `EMAIL_FROM`, with the sending domain verified in Resend. Without a key, emails are only logged.
- **Everything else is optional:** `APP_URL`, `ADMIN_EMAILS`, Google sign-in, Turnstile, and `ALERT_WEBHOOK_URL`.

`APP_URL` can stay blank at first. The Worker adopts the first URL it's visited on, so you can create the OAuth app once you know the URL. **Set `APP_URL` explicitly when you add a custom domain.**

## By hand

You'll need a Cloudflare account, Node 22+, a Resend account and a GitHub OAuth app.

```sh
git clone https://github.com/m8team/sendmate && cd sendmate
npm install
npx wrangler login
```

### Settings and secrets

Every setting in [`.dev.vars.example`](../.dev.vars.example) is a Worker secret. Set the ones you need:

```sh
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put IP_HASH_SECRET
npx wrangler secret put ENCRYPTION_KEY      # exactly 32 bytes, base64. Keep a copy: losing it makes stored keys unreadable.
npx wrangler secret put APP_URL             # e.g. https://forms.example.com
npx wrangler secret put EMAIL_FROM          # e.g. "Forms <notify@example.com>"
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
# optional: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_EMAILS, TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, ALERT_WEBHOOK_URL
```

`DEV_LOGIN` is for local development only. **Never** set it in production (it's ignored anyway unless both `APP_URL` and the request are `http://localhost`).

### Deploy

```sh
npm run build                                           # builds web/ (the site the Worker serves)
npm run deploy                                          # deploys, creates the D1 database if needed, runs migrations
npx wrangler deploy --domain forms.example.com         # optional: attach your own domain (must be a zone in your account)
```

You don't need the database id in `wrangler.jsonc`. Later deploys reuse the database bound to the Worker, and migrations find it by name. Wrangler may offer to write the id in after the first deploy. That's fine to keep in your own fork, but pull requests to the main sendm8 repo must not include it (CI checks), because the Deploy button needs the file without one.

sendm8.com itself deploys with `npm run deploy:sendm8`, which does the same thing with `--domain sendm8.com`.

## File uploads (R2)

File uploads are on in [`wrangler.jsonc`](../wrangler.jsonc), and the `sendm8-files` bucket is created on the first deploy. R2 needs a payment method on your Cloudflare account, although the free tier covers 10 GB and sendm8 enforces caps below that (`packages/shared/src/limits.ts`).

**No card on your account?** The deploy fails until R2 is enabled. Delete the `r2_buckets` block instead: file inputs are then ignored and submissions still come through.

## AI spam scoring (Workers AI)

The `ai` binding is on in `wrangler.jsonc` and needs no payment method. Form owners switch on AI spam scoring per form. Checks are capped by `aiSpamChecksPerDay`, which fits Workers AI's free allowance. Delete the `ai` block to remove the option.

## Tuning limits

Every limit lives in `packages/shared/src/limits.ts`. The marketing site, the dashboard and the Worker all read them from there. To override them per deployment without a code change, set the `LIMITS_JSON` var in `wrangler.jsonc`:

```jsonc
"vars": { "LIMITS_JSON": "{\"systemEmailsPerDay\": 1600, \"instantEmailsPerUserPerDay\": 50}" }
```

Typical reasons: you upgraded Resend (raise `systemEmailsPerDay`), or you're the only user (raise the per-form quotas).

The platform ceilings live there too, set for the free plan. If you move to Workers Paid ($5/mo), raise them to match:

```jsonc
"vars": { "LIMITS_JSON": "{\"databaseMaxBytes\": 10737418240, \"queriesPerInvocation\": 1000}" }
```

| Key | Default | What it does |
|---|---|---|
| `databaseMaxBytes` | 500 MB | The D1 size cap that usage alerts and load shedding measure against. 10 GB on Workers Paid. |
| `queriesPerInvocation` | 50 | D1 queries one cron run or bulk action may use before leaving the rest for later. 1,000 on Workers Paid. |
| `submissionRetentionDays` | 0 (keep forever) | Delete submissions and their files older than this, nightly at 03:00 UTC. Update your privacy policy if you turn it on. |

## Staying on the free tier

| Limit (free) | What sendm8 does |
|---|---|
| 100k D1 writes/day | ~3 writes per submission. The hourly check alerts at 70% and 90%, and above 90% it stops storing spam and pauses new zero-signup endpoints. |
| 500 MB per D1 database | Roughly 150–250k stored submissions. Same 70%/90% alerts and load shedding. Spam is purged after 30 days; set `submissionRetentionDays` to purge everything older than that too. |
| 50 D1 queries per invocation | Cron jobs and bulk actions stop before the cap and pick up the rest on the next run. |
| 10 ms CPU/request | OAuth-only login, capped body sizes, small cron batches |
| 100 Resend emails/day | 10 instant emails per account per day, then a daily digest. BYOK Resend keys bypass it entirely. |
| 10 GB R2 | Per-account and platform-wide byte caps (9 GB hard stop) |

## Admin

Admins (`ADMIN_EMAILS`, signed in with a verified email) get `/app/admin`, which covers usage, abuse reports, errors, disabling and restoring forms, suspending users, and the blocklist. The same actions are available at `/api/admin/*`.

## Alerts and error tracking

Set `ALERT_WEBHOOK_URL` to a Discord or Slack incoming webhook and sendm8 posts there when:

| Alert | When |
|---|---|
| Usage | D1 writes, system emails, file storage or database size pass 70% or 90% of their limit (once each per day) |
| Error | A new error appears in the Worker or a visitor's browser, a resolved one comes back, or one reaches 10, 100 or 1,000 occurrences |
| Resend key rejected | Resend refuses `RESEND_API_KEY` or the sending domain (at most hourly) |
| Form flagged | Enough abuse reports flag a form and its submissions are held |
| Submission held | The phishing guard holds a submission (once per form per day) |
| New sign-up / new form | Someone creates an account or a form. Email addresses are partly hidden. |

Each kind is capped at `opsAlertsPerTypePerDay` (50) a day, so a spam wave can't flood the channel. Mentions are disabled, so a form called "@everyone" can't ping anyone.

Errors work like Sentry issues: occurrences are grouped by fingerprint, with a count, first and last seen, the latest stack trace and context (route, page, browser). Browser errors come from the site and dashboard through `POST /api/errors`. Emails and tokens are scrubbed before anything is stored or posted. Review and resolve them under **Errors** on `/app/admin`. Up to `errorEventsPerDay` (500) are recorded a day, and groups are deleted `errorRetentionDays` (30) after they were last seen.

## Privacy policy and terms

`/privacy` and `/terms` are built from [`docs/legal/`](legal/). They name m8team, which runs sendm8.com, as the operator. If you run a public instance, replace the operator, contact emails and governing law with your own, and have them checked.

## Updating

```sh
git pull
npm install
npm run build && npm run deploy
```

## Backups

```sh
npx wrangler d1 export sendm8 --remote --output backup.sql
```

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars    # fill in the three random secrets, and uncomment the two local-only lines at the bottom
npm run db:migrate:local -w worker
npm run dev                       # builds web/, then serves everything on http://localhost:8787
```

The sign-in page shows a **Dev sign-in** button on localhost, so you don't need OAuth apps locally. Add `ADMIN_EMAILS=dev@sendm8.local` to `.dev.vars` to see the admin page.
