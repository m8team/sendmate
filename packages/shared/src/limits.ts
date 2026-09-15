export type Limits = {
  maxBodyBytes: number;
  maxFields: number;
  maxFieldNameLength: number;
  maxFieldValueBytes: number;
  maxFormsPerUser: number;
  maxChannelsPerForm: number;
  maxEmailAddressesPerUser: number;
  digestHourUtc: number;
  maxDeliveryAttempts: number;
  submissionsPerFormPerMonth: number;
  submissionsPerUnclaimedFormPerMonth: number;
  zeroSignupFormsPerIpPerDay: number;
  instantEmailsPerUserPerDay: number;
  systemEmailsPerDay: number;
  reservedAccountEmailsPerDay: number;
  burstPerIpPerFormPerMinute: number;
  burstPerFormPerMinute: number;
  spamRetentionDays: number;
  reportsToAutoFlag: number;
  maxFileBytes: number;
  maxUploadBytes: number;
  maxFilesPerSubmission: number;
  storagePerUserBytes: number;
  storagePerUnclaimedFormBytes: number;
  storageTotalBytes: number;
  fileLinkTtlDays: number;
  aiSpamChecksPerDay: number;
  databaseMaxBytes: number;
  queriesPerInvocation: number;
  submissionRetentionDays: number;
  opsAlertsPerTypePerDay: number;
  errorEventsPerDay: number;
  errorRetentionDays: number;
};

/**
 * Every tunable limit lives here so the worker, dashboard and marketing site agree.
 * Hosted defaults are sized for Cloudflare + Resend free tiers; self-hosters and a
 * future Resend Pro upgrade can raise them via worker env vars (see worker/src/config.ts).
 */
export const LIMITS: Limits = {
  /** Request body cap for submissions (bytes). Keeps parsing well under 10ms CPU. */
  maxBodyBytes: 64 * 1024,
  maxFields: 100,
  maxFieldNameLength: 100,
  maxFieldValueBytes: 10 * 1024,

  /** Forms are unlimited in spirit; this only stops scripted abuse. */
  maxFormsPerUser: 100,
  maxChannelsPerForm: 10,
  maxEmailAddressesPerUser: 10,

  /** Hour (UTC) daily digest emails go out. */
  digestHourUtc: 18,
  /** Delivery attempts before a channel is marked permanently failed. */
  maxDeliveryAttempts: 5,

  /** Stored submissions per form per calendar month (UTC). */
  submissionsPerFormPerMonth: 1_000,
  /** Stored submissions per zero-signup (unclaimed) form per month. */
  submissionsPerUnclaimedFormPerMonth: 100,
  /** New `/f/you@example.com` endpoints a single IP can create per day. */
  zeroSignupFormsPerIpPerDay: 5,

  /** Instant notification emails per user per day via the sendm8 sender. Overflow goes to the digest. */
  instantEmailsPerUserPerDay: 10,
  /** Platform-wide system email budget per day (Resend free = 100). */
  systemEmailsPerDay: 100,
  /** Portion of the daily system budget reserved for verification/confirmation emails. */
  reservedAccountEmailsPerDay: 30,

  /** Burst limits (per Cloudflare location, approximate). */
  burstPerIpPerFormPerMinute: 10,
  burstPerFormPerMinute: 120,

  /** Days before submissions marked as spam are deleted. */
  spamRetentionDays: 30,

  /** Distinct reporters (within 7 days) that automatically flag a form for review. */
  reportsToAutoFlag: 3,

  // ── File uploads (only when an R2 bucket is bound) ──
  // Multipart bodies are parsed in the Worker, so sizes stay modest to fit the free plan's CPU budget.
  /** Largest single file. */
  maxFileBytes: 5 * 1024 * 1024,
  /** Largest multipart submission including files. */
  maxUploadBytes: 10 * 1024 * 1024,
  maxFilesPerSubmission: 5,
  /** Stored file bytes per account. */
  storagePerUserBytes: 250 * 1024 * 1024,
  /** Stored file bytes per unclaimed zero-signup form. */
  storagePerUnclaimedFormBytes: 25 * 1024 * 1024,
  /** Hard stop for the whole platform, safely under R2's 10 GB free tier. */
  storageTotalBytes: 9 * 1024 * 1024 * 1024,
  /** How long file links in notifications and webhooks stay valid. */
  fileLinkTtlDays: 7,

  /** Platform-wide AI spam checks per day, well inside Workers AI's free daily allowance. */
  aiSpamChecksPerDay: 1_000,

  // ── Platform ceilings (Cloudflare free plan; raise with LIMITS_JSON on Workers Paid) ──
  /** Largest D1 database: 500 MB free, 10 GB paid. Usage alerts and load shedding measure against this. */
  databaseMaxBytes: 500 * 1024 * 1024,
  /** D1 queries allowed in one Worker invocation (each batch statement counts): 50 free, 1,000 paid. */
  queriesPerInvocation: 50,
  /** Delete submissions (and their files) older than this many days. 0 keeps them until the owner deletes them. */
  submissionRetentionDays: 0,

  // ── Operator alerts and error tracking (ALERT_WEBHOOK_URL, /app/admin) ──
  /** Alerts of one kind (sign-ups, new forms, held submissions…) posted per day. The rest are muted until tomorrow (UTC). */
  opsAlertsPerTypePerDay: 50,
  /** Error events recorded per day across the Worker and browsers. Beyond this they're only logged, to protect D1 writes. */
  errorEventsPerDay: 500,
  /** Error groups not seen for this many days are deleted. */
  errorRetentionDays: 30,
};
