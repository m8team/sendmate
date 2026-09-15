import { LIMITS } from '@sendm8/shared';

/**
 * Every number, limit and quota on the site lives here.
 * Change it once, and the marketing pages, docs and dashboard all follow.
 */

export const site = {
  name: 'sendm8',
  domain: 'sendm8.com',
  url: 'https://sendm8.com',
  endpointBase: 'https://sendm8.com/f/',
  tagline: "Your form's got mail.",
  description:
    'sendm8 is a free, open-source form backend. Point any HTML form at a URL and get the submissions by email, Discord, Slack, Telegram or webhook. No server, no signup required.',
  repo: 'https://github.com/m8team/sendmate',
  repoShort: 'github.com/m8team/sendmate',
  deployUrl: 'https://deploy.workers.cloudflare.com/?url=https://github.com/m8team/sendmate',
  license: 'AGPL-3.0',
  sponsorUrl: 'https://github.com/sponsors/m8team',
  abuseEmail: 'abuse@sendm8.com',
  helloEmail: 'hello@sendm8.com',
} as const;

const MB = 1024 * 1024;

/**
 * Marketing copy quotes these, so they come straight from the limits the Worker enforces
 * (packages/shared/src/limits.ts). Never hard-code a number here that the backend also knows.
 */
export const limits = {
  /** Instant notification emails per account per day through sendm8's shared sender. The rest go in the daily digest. */
  emailsPerDay: LIMITS.instantEmailsPerUserPerDay,
  /** Stored submissions per form, per calendar month (hosted). */
  submissionsPerFormPerMonth: LIMITS.submissionsPerFormPerMonth,
  /** Forms per account. */
  forms: LIMITS.maxFormsPerUser,
  /** Discord / Slack / Telegram / webhook deliveries. Infinity renders as "Unlimited". */
  channelDeliveries: Infinity,
  /** Max size of a single uploaded file, in MB. */
  fileUploadMb: LIMITS.maxFileBytes / MB,
  /** Max total upload size per submission, in MB. */
  submissionUploadMb: LIMITS.maxUploadBytes / MB,
  /** Max fields in one submission. */
  fieldsPerSubmission: LIMITS.maxFields,
  /** Max request body when no files are attached, in KB. */
  bodyKb: LIMITS.maxBodyBytes / 1024,
  /** Burst rate limit: submissions per IP, per form, per minute. */
  ratePerIpPerMinute: LIMITS.burstPerIpPerFormPerMinute,
  /** Burst rate limit: submissions per form, per minute. */
  ratePerFormPerMinute: LIMITS.burstPerFormPerMinute,
  /** Days before submissions marked as spam are auto-deleted. */
  spamRetentionDays: LIMITS.spamRetentionDays,
  /** Zero-signup: confirmation emails per address, per this many hours (worker/src/pipeline/zero-signup.ts). */
  confirmationCooldownHours: 24,
  /** Time the daily digest goes out (24h, UTC). */
  digestHourUtc: LIMITS.digestHourUtc,
  /** Webhook request timeout, seconds (worker/src/channels/http.ts). */
  webhookTimeoutSeconds: 5,
  /** Resend's own free plan, quoted on BYOK copy. Theirs, not ours: check it now and then. */
  resendFreeEmailsPerMonth: 3000,
  /** Delivery retry schedule (worker/src/pipeline/deliver.ts). */
  retrySchedule: ['1m', '5m', '30m', '2h', '12h'],
} as const;

export const fmt = {
  n: (value: number) => (Number.isFinite(value) ? value.toLocaleString('en-GB') : 'Unlimited'),
  qty: (value: number) => (Number.isFinite(value) ? value.toLocaleString('en-GB') : '∞'),
};

export const nav = {
  marketing: [
    { href: '/docs', label: 'Docs' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/#compare', label: 'Compare' },
    { href: site.repo, label: 'GitHub', external: true },
  ],
  app: [
    { href: '/app', label: 'Forms', key: 'forms' },
    { href: '/app/account/email', label: 'Email & BYOK', key: 'email' },
  ],
} as const;

/** Frameworks offered in the setup code tabs. */
export const frameworks = ['HTML', 'React', 'Vue', 'Astro', 'Next.js'] as const;
