import type { Delivery, Limits } from "@sendm8/shared";
import { and, eq, isNull } from "drizzle-orm";
import { getLimits } from "../config";
import { getDb, type Db, type FormRow, type SubmissionRow } from "../db/client";
import { channels, emailAddresses, forms, submissions, userSettings } from "../db/schema";
import { drivers, isExternalChannel, toNotification } from "../channels";
import type { NotificationFile } from "../channels/types";
import { signedFileLinks } from "../files/storage";
import type { ChannelResult } from "../channels/http";
import { claimSystemEmail } from "../email/budget";
import { byokUsable, sendByokEmail, sendSystemEmail, type OutgoingEmail } from "../email/sender";
import { notificationEmail } from "../email/templates";
import { decryptJson } from "../lib/secrets";
import { urls } from "../lib/urls";
import { captureError } from "../ops/errors";

export type ChannelRow = typeof channels.$inferSelect;
type AddressRow = typeof emailAddresses.$inferSelect;
type SettingsRow = typeof userSettings.$inferSelect;

export interface EmailChannelConfig {
  emailAddressId: string;
}

const EMAIL_PATTERN = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;
export const isEmail = (value: string | undefined): value is string => Boolean(value && value.length <= 254 && EMAIL_PATTERN.test(value));

/** Retry delays after attempt 1, 2, 3, 4 (minutes). */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720];

export function nextDigestAt(now: number, limits: Limits): number {
  const d = new Date(now);
  const at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), limits.digestHourUtc);
  return at > now ? at : at + 86_400_000;
}

interface DeliveryInput {
  env: Env;
  db: Db;
  limits: Limits;
  now: number;
  form: FormRow;
  submission: SubmissionRow;
  addresses: AddressRow[];
  settings: SettingsRow | undefined;
  files: NotificationFile[];
}

export function buildNotification(
  env: Env,
  form: FormRow,
  submission: Pick<SubmissionRow, "id" | "data" | "meta" | "createdAt">,
  isTest = false,
  files: NotificationFile[] = [],
): OutgoingEmail {
  const replyTo = submission.meta.special._replyto ?? (typeof submission.data.email === "string" ? submission.data.email : undefined);
  const rendered = notificationEmail({
    formName: form.name,
    subject: submission.meta.special._subject,
    data: submission.data,
    submittedAt: submission.createdAt,
    referrer: submission.meta.referrer,
    submissionUrl: urls.submission(env.APP_URL, form.id, submission.id),
    settingsUrl: urls.formNotifications(env.APP_URL, form.id),
    reportUrl: urls.report(env.APP_URL, form.id),
    isTest,
    files,
  });
  return { to: [], ...rendered, ...(isEmail(replyTo) && { replyTo }) };
}

/** Marks a user's BYOK key as rejected so the dashboard can prompt them to fix it. */
export async function flagByokKey(db: Db, userId: string, error: string) {
  await db.update(userSettings).set({ resendKeyError: error, resendVerifiedAt: null }).where(eq(userSettings.userId, userId));
}

function fromChannelResult(channelId: string, result: ChannelResult, attempts: number, limits: Limits, now: number): Delivery {
  if (result.ok) return { channelId, status: "sent", attempts, at: now };
  const exhausted = !result.retryable || attempts >= limits.maxDeliveryAttempts;
  return { channelId, status: exhausted ? "skipped" : "failed", attempts, error: result.error, at: now };
}

async function deliverEmail(input: DeliveryInput, channel: ChannelRow, attempts: number): Promise<Delivery> {
  const { env, db, limits, now, form, submission, addresses, settings } = input;
  const config = await decryptJson<EmailChannelConfig>(env, channel.configEnc);
  const recipient = addresses.find((a) => a.id === config.emailAddressId);

  if (!recipient) return { channelId: channel.id, status: "skipped", attempts, error: "recipient_removed", at: now };
  if (!recipient.verifiedAt) return { channelId: channel.id, status: "skipped", attempts, error: "recipient_unverified", at: now };
  if (form.settings.notifyMode === "digest") return { channelId: channel.id, status: "digest", attempts, at: now };

  // _cc only reaches addresses this user has already verified.
  const verified = new Set(addresses.filter((a) => a.verifiedAt).map((a) => a.email));
  const cc = (submission.meta.special._cc ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e !== recipient.email && verified.has(e));

  const message: OutgoingEmail = {
    ...buildNotification(env, form, submission, false, input.files),
    to: [recipient.email],
    ...(cc.length && { cc }),
    idempotencyKey: `notify:${submission.id}:${channel.id}`,
  };

  if (byokUsable(settings)) {
    const result = await sendByokEmail(env, settings, message);
    if (!result.ok && result.keyRejected) {
      await flagByokKey(db, form.userId!, result.error);
      return { channelId: channel.id, status: "digest", attempts, error: "byok_key_rejected", at: now };
    }
    return fromChannelResult(channel.id, result, attempts, limits, now);
  }

  // Unclaimed zero-signup forms are capped per form, since there's no account to cap.
  if (!(await claimSystemEmail(env.DB, limits, "instant", form.userId ?? `form:${form.id}`, now))) {
    return { channelId: channel.id, status: "digest", attempts, error: "instant_limit_reached", at: now };
  }
  return fromChannelResult(channel.id, await sendSystemEmail(env, message), attempts, limits, now);
}

async function deliverToChannel(input: DeliveryInput, channel: ChannelRow, attempts: number): Promise<Delivery> {
  try {
    switch (channel.type) {
      case "email":
        return await deliverEmail(input, channel, attempts);
      default: {
        if (!isExternalChannel(channel.type)) {
          return { channelId: channel.id, status: "skipped", attempts, error: "channel_type_unsupported", at: input.now };
        }
        // Chat and webhook channels cost nothing to send, so they're always instant and unlimited.
        const config = await decryptJson(input.env, channel.configEnc);
        const notification = toNotification(input.env, input.form, input.submission, false, input.files);
        const result = await drivers[channel.type].send(config, notification, { env: input.env });
        return fromChannelResult(channel.id, result, attempts, input.limits, input.now);
      }
    }
  } catch (error) {
    await captureError(input.env, error, { where: "delivery", channelType: channel.type, submissionId: input.submission.id });
    const exhausted = attempts >= input.limits.maxDeliveryAttempts;
    return { channelId: channel.id, status: exhausted ? "skipped" : "failed", attempts, error: `internal: ${String(error).slice(0, 200)}`, at: input.now };
  }
}

/**
 * Fans a stored submission out to its form's channels, then records the outcome in one write.
 * Safe to call repeatedly (retries): channels already sent/digested/skipped are left alone.
 */
export async function deliverSubmission(env: Env, submissionId: string, now = Date.now()): Promise<void> {
  const db = getDb(env);
  const limits = getLimits(env);

  const row = await db
    .select({ submission: submissions, form: forms })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(eq(submissions.id, submissionId))
    .get();
  if (!row) return;
  const { submission, form } = row;

  const owned = Boolean(form.userId || form.ownerEmail);
  const deliverable = submission.status === "ok" && form.status === "active" && owned && form.settings.notifyMode !== "off";
  if (!deliverable) {
    if (submission.retryAt !== null) await db.update(submissions).set({ retryAt: null }).where(eq(submissions.id, submission.id));
    return;
  }

  const [channelRows, addresses, settingsRows] = await db.batch([
    db.select().from(channels).where(and(eq(channels.formId, form.id), eq(channels.enabled, true))),
    form.userId
      ? db.select().from(emailAddresses).where(eq(emailAddresses.userId, form.userId))
      : db
          .select()
          .from(emailAddresses)
          .where(and(isNull(emailAddresses.userId), eq(emailAddresses.email, form.ownerEmail!))),
    db.select().from(userSettings).where(eq(userSettings.userId, form.userId ?? "")),
  ]);
  if (channelRows.length === 0) {
    if (submission.retryAt !== null) await db.update(submissions).set({ retryAt: null }).where(eq(submissions.id, submission.id));
    return;
  }

  const files = await signedFileLinks(env, submission, now);
  const input: DeliveryInput = { env, db, limits, now, form, submission, addresses, settings: settingsRows[0], files };
  const previous = new Map(submission.deliveries.map((d) => [d.channelId, d]));

  const results = await Promise.all(
    channelRows.map((channel) => {
      const prior = previous.get(channel.id);
      if (prior && prior.status !== "failed") return prior;
      return deliverToChannel(input, channel, (prior?.attempts ?? 0) + 1);
    }),
  );

  // Keep history for channels that have since been removed or disabled.
  const current = new Set(channelRows.map((c) => c.id));
  const deliveries = [...results, ...submission.deliveries.filter((d) => !current.has(d.channelId))];

  const failed = results.filter((d) => d.status === "failed");
  const retryAt = failed.length ? now + BACKOFF_MINUTES[Math.min(Math.max(...failed.map((d) => d.attempts)) - 1, BACKOFF_MINUTES.length - 1)]! * 60_000 : null;
  const wantsDigest = results.some((d) => d.status === "digest");
  const digestAt = wantsDigest ? (submission.digestAt ?? nextDigestAt(now, limits)) : null;

  await db.update(submissions).set({ deliveries, retryAt, digestAt }).where(eq(submissions.id, submission.id));
}

