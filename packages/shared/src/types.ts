import type { Limits } from "./limits";

export type FormStatus = "active" | "paused" | "pending_confirmation" | "disabled";

export type SubmissionStatus = "ok" | "spam" | "held" | "pending_challenge";

export type FieldValue = string | string[];

export interface FormSettings {
  /** Honeypot field name. `_gotcha` and `_honeypot` are always honoured too. Send null to clear. */
  honeypotField?: string | null;
  /** Instant notifications, digest only, or none. */
  notifyMode?: "instant" | "digest" | "off";
  /** Reject submissions with no Origin/Referer when allowed origins are set. Defaults to true. */
  strictOrigin?: boolean;
  /**
   * When browser (non-AJAX) submissions must pass a Turnstile check on sendm8.com first.
   * Defaults to "suspicious". Ignored when the form uses its own Turnstile secret.
   */
  challenge?: "off" | "suspicious" | "always";
  /** Ask Workers AI to double-check submissions that passed the heuristics. Off by default. */
  aiSpamScoring?: boolean;
}

export interface SubmissionMeta {
  ipHash: string | null;
  country: string | null;
  userAgent: string | null;
  referrer: string | null;
  /** Special underscore fields submitted with the form (_subject, _replyto, _cc…). */
  special: Record<string, string>;
  spamReasons: string[];
  /** Field names of uploaded files that were ignored (uploads arrive in a later milestone). */
  droppedFiles?: string[];
  /** Uploaded files stored in R2. */
  files?: StoredFile[];
  /** Storage counter the files were charged to (e.g. "user:abc"), so deletes release the right one. */
  storageScope?: string;
  /** Where to send the visitor after passing a challenge. */
  next?: string;
}

/**
 * sent: delivered (instantly, or later in a digest when `viaDigest`)
 * digest: waiting for the next digest email
 * failed: will retry until attempts run out
 * skipped: permanently not delivered (e.g. unverified recipient)
 */
export type DeliveryStatus = "sent" | "failed" | "digest" | "skipped";

export interface Delivery {
  channelId: string;
  status: DeliveryStatus;
  attempts: number;
  error?: string;
  viaDigest?: boolean;
  at: number;
}

export interface ApiError {
  error: { code: string; message: string };
}

export interface SubmitSuccess {
  ok: true;
  id: string;
  next?: string;
}

export interface SubmitFailure {
  ok: false;
  error: { code: string; message: string };
}

// ── Dashboard API ───────────────────────────────────────────────────────────

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface FormDto {
  id: string;
  name: string;
  status: FormStatus;
  /** The URL to put in a form's `action`. */
  endpoint: string;
  allowedOrigins: string[];
  redirectUrl: string | null;
  settings: FormSettings;
  flaggedReason: string | null;
  /** Whether the form verifies its own Turnstile widget. */
  turnstileConfigured: boolean;
  /** `/f/you@example.com` style endpoint, for forms that started as zero-signup. */
  emailEndpoint: string | null;
  createdAt: number;
  submissionsThisMonth: number;
  monthlyLimit: number;
  lastSubmissionAt: number | null;
  /** Folder counts. Only included on `GET /api/forms/:id`. */
  counts?: FolderCounts;
}

export interface FolderCounts {
  inbox: number;
  spam: number;
  held: number;
  starred: number;
  total: number;
}

export interface SubmissionDto {
  id: string;
  formId: string;
  data: Record<string, FieldValue>;
  status: SubmissionStatus;
  spamScore: number;
  starred: boolean;
  createdAt: number;
  country: string | null;
  referrer: string | null;
  userAgent: string | null;
  special: Record<string, string>;
  spamReasons: string[];
  droppedFiles: string[];
  /** Uploaded files. `url` is an authenticated download link (same-origin, session cookie). */
  files: SubmissionFileDto[];
  deliveries: Delivery[];
  /** When failed deliveries will next be retried automatically (epoch ms), if any. */
  retryAt: number | null;
}

export interface StoredFile {
  id: string;
  field: string;
  name: string;
  size: number;
  type: string;
  /** R2 object key. */
  key: string;
}

export interface SubmissionFileDto {
  id: string;
  field: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

/** `inbox` = ok submissions. */
export type SubmissionFilter = "inbox" | "spam" | "held" | "starred" | "all";

export type BulkAction = "delete" | "spam" | "not_spam" | "star" | "unstar";

export interface DailyStat {
  day: string;
  submissions: number;
}

export interface MeDto {
  user: { id: string; name: string; email: string; image: string | null };
  /** Effective limits for this deployment (defaults plus any LIMITS_JSON overrides). */
  limits: Limits;
}

export type ChannelType = "email" | "discord" | "slack" | "telegram" | "webhook";

export interface ChannelDto {
  id: string;
  formId: string;
  type: ChannelType;
  /** Non-secret summary, e.g. the recipient address. */
  label: string;
  enabled: boolean;
  createdAt: number;
  /** Email channels: whether the recipient address is verified. */
  recipientVerified?: boolean;
  /** Result of the most recent "Send test". */
  lastTest: ChannelTestResult | null;
}

export interface ChannelTestResult {
  at: number;
  ok: boolean;
  message: string;
}

export interface EmailAddressDto {
  id: string;
  email: string;
  verified: boolean;
  verifiedAt: number | null;
  /** When the last verification email went out (resends have a cooldown). */
  verificationSentAt: number | null;
  createdAt: number;
}

export interface EmailSettingsDto {
  byok: {
    configured: boolean;
    /** e.g. "re_••••abcd" */
    keyHint: string | null;
    from: string | null;
    /** false when Resend rejected the key; see `error`. */
    healthy: boolean;
    error: string | null;
  };
  usage: {
    instantToday: number;
    instantLimit: number;
  };
  /** Hour of day (UTC) digests are sent. */
  digestHourUtc: number;
}

/** Returned only when a channel is created or its secret rotated. */
export interface CreatedChannelDto extends ChannelDto {
  /** Webhook signing secret. Shown once. */
  secret?: string;
}

/**
 * Body of `submission.created` webhooks. Verify `X-Sendm8-Signature` (`t=<unix>,v1=<hex>`),
 * where v1 = HMAC-SHA256(secret, `${t}.${rawBody}`).
 */
export interface WebhookPayload {
  event: "submission.created" | "test";
  form: { id: string; name: string };
  submission: {
    id: string;
    createdAt: string;
    data: Record<string, FieldValue>;
    subject: string | null;
    replyTo: string | null;
    referrer: string | null;
    country: string | null;
    /** Uploaded files. `url` is a signed download link that expires. */
    files: { field: string; name: string; size: number; type: string; url: string }[];
  };
}

// ── Abuse & admin ───────────────────────────────────────────────────────────

export type AbuseReason = "phishing" | "spam" | "malware" | "impersonation" | "other";

export type BlocklistType = "ip_hash" | "email" | "email_domain" | "user";

export interface AdminReportDto {
  id: string;
  reason: AbuseReason;
  details: string | null;
  reporterEmail: string | null;
  createdAt: number;
  resolvedAt: number | null;
  form: { id: string; name: string; status: FormStatus; flaggedReason: string | null; ownerEmail: string | null } | null;
}

export interface BlocklistEntryDto {
  type: BlocklistType;
  value: string;
  reason: string | null;
  createdAt: number;
}

export interface AdminUsageDto {
  day: string;
  submissions: number;
  systemEmails: number;
  systemEmailLimit: number;
  /** Rough D1 rows written today, against the free plan limit of 100k per day. */
  estimatedWrites: number;
  topForms: { formId: string; submissions: number }[];
  /** Stored upload bytes across the platform, against the R2 cap. */
  storageBytes: number;
  storageLimitBytes: number;
  /** Size of the D1 database (null if it couldn't be read), against the plan's per-database cap. */
  databaseBytes: number | null;
  databaseLimitBytes: number;
}
