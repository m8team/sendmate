import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AbuseReason, ChannelTestResult, Delivery, FormSettings, FormStatus, SubmissionMeta, SubmissionStatus } from "@sendm8/shared";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
};

// ── Better Auth core tables ────────────────────────────────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  ...timestamps,
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ── sendm8 ─────────────────────────────────────────────────────────────────

export const forms = sqliteTable(
  "forms",
  {
    id: text("id").primaryKey(),
    /** NULL for unclaimed zero-signup forms. */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").$type<FormStatus>().notNull().default("active"),
    /** Hostnames allowed to submit. Empty = any. */
    allowedOrigins: text("allowed_origins", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    redirectUrl: text("redirect_url"),
    settings: text("settings", { mode: "json" }).$type<FormSettings>().notNull().default(sql`'{}'`),
    /** Owner email for zero-signup forms. */
    ownerEmail: text("owner_email"),
    turnstileSecretEnc: text("turnstile_secret_enc"),
    /** Set by abuse reports or admins. Submissions to flagged forms are held, not delivered. */
    flaggedReason: text("flagged_reason"),
    /** Set when an admin has reviewed the form; skips the sensitive-field hold. */
    reviewedAt: integer("reviewed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("forms_user_idx").on(t.userId), uniqueIndex("forms_owner_email_idx").on(t.ownerEmail)],
);

export const emailAddresses = sqliteTable(
  "email_addresses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    verifiedAt: integer("verified_at"),
    tokenHash: text("token_hash"),
    tokenSentAt: integer("token_sent_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("email_addresses_user_email_idx").on(t.userId, t.email), index("email_addresses_token_idx").on(t.tokenHash)],
);

export const channels = sqliteTable(
  "channels",
  {
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    type: text("type").$type<"email" | "discord" | "slack" | "telegram" | "webhook">().notNull(),
    /** AES-GCM encrypted JSON config. */
    configEnc: text("config_enc").notNull(),
    /** Non-secret summary for display, e.g. "#general" or "you@example.com". */
    label: text("label").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastTest: text("last_test", { mode: "json" }).$type<ChannelTestResult>(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("channels_form_idx").on(t.formId)],
);

export const submissions = sqliteTable(
  "submissions",
  {
    /** ULID: sortable by time, used as the pagination cursor. */
    id: text("id").primaryKey(),
    formId: text("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    data: text("data", { mode: "json" }).$type<Record<string, string | string[]>>().notNull(),
    meta: text("meta", { mode: "json" }).$type<SubmissionMeta>().notNull(),
    spamScore: real("spam_score").notNull().default(0),
    status: text("status").$type<SubmissionStatus>().notNull(),
    starred: integer("starred", { mode: "boolean" }).notNull().default(false),
    deliveries: text("deliveries", { mode: "json" }).$type<Delivery[]>().notNull().default(sql`'[]'`),
    /** Set only while a delivery awaits retry (partial index keeps it cheap). */
    retryAt: integer("retry_at"),
    /** When this submission is due to go out in a digest email (partial index). */
    digestAt: integer("digest_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("submissions_form_idx").on(t.formId, t.id),
    index("submissions_retry_idx").on(t.retryAt).where(sql`retry_at IS NOT NULL`),
    index("submissions_digest_idx").on(t.digestAt).where(sql`digest_at IS NOT NULL`),
  ],
);

export const usageDaily = sqliteTable(
  "usage_daily",
  {
    /** "form" | "user" | "system_email" */
    scope: text("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    /** YYYY-MM-DD (UTC) */
    day: text("day").notNull(),
    submissions: integer("submissions").notNull().default(0),
    emails: integer("emails").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.scope, t.scopeId, t.day] })],
);

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  resendKeyEnc: text("resend_key_enc"),
  resendKeyHint: text("resend_key_hint"),
  resendFrom: text("resend_from"),
  /** Set when the key last validated or sent successfully; cleared when Resend rejects it. */
  resendVerifiedAt: integer("resend_verified_at"),
  resendKeyError: text("resend_key_error"),
});

export const abuseReports = sqliteTable(
  "abuse_reports",
  {
    id: text("id").primaryKey(),
    formId: text("form_id").notNull(),
    reason: text("reason").$type<AbuseReason>().notNull(),
    details: text("details"),
    reporterEmail: text("reporter_email"),
    /** Used to count distinct reporters, never shown. */
    ipHash: text("ip_hash"),
    resolvedAt: integer("resolved_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("abuse_reports_form_idx").on(t.formId, t.createdAt)],
);

export const blocklist = sqliteTable(
  "blocklist",
  {
    /** "ip_hash" | "email" | "email_domain" | "user" */
    type: text("type").notNull(),
    value: text("value").notNull(),
    reason: text("reason"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.type, t.value] })],
);

/** Running totals of stored file bytes (R2), for per-owner and platform-wide caps. */
export const storageUsage = sqliteTable(
  "storage_usage",
  {
    /** "global" | "user" | "form" (unclaimed forms) */
    scope: text("scope").notNull(),
    scopeId: text("scope_id").notNull(),
    bytes: integer("bytes").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.scope, t.scopeId] })],
);

/** Small key/value settings the instance learns at runtime (e.g. its own URL when APP_URL isn't set). */
export const instanceSettings = sqliteTable("instance_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Grouped errors from the Worker and browsers, like issues in Sentry. One row per fingerprint. */
export const errorGroups = sqliteTable(
  "error_groups",
  {
    /** Hash of source, error name, normalised message and top stack frames. */
    id: text("id").primaryKey(),
    /** "worker" | "browser" */
    source: text("source").notNull(),
    name: text("name").notNull(),
    message: text("message").notNull(),
    stack: text("stack"),
    /** Context of the latest occurrence (route, page, job, browser). */
    context: text("context", { mode: "json" }).$type<Record<string, string>>().notNull(),
    count: integer("count").notNull().default(1),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [index("error_groups_last_seen_idx").on(t.lastSeenAt)],
);
