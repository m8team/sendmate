import { and, asc, count, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { SessionUser } from "../app";
import { getLimits } from "../config";
import { getDb, type BatchItem, type BatchList, type Db, type FormRow } from "../db/client";
import { channels, emailAddresses, forms, submissions } from "../db/schema";
import { claimCounter, claimSystemEmail } from "../email/budget";
import { sendSystemEmail } from "../email/sender";
import { zeroSignupConfirmEmail } from "../email/templates";
import { findByToken } from "../email/verification";
import { deleteSubmissionFiles, submissionsWithFiles } from "../files/storage";
import { sha256Hex } from "../lib/crypto";
import { parseHttpUrl } from "../lib/http";
import { newFormId, newId } from "../lib/ids";
import { decryptJson, encryptJson, randomToken } from "../lib/secrets";
import { dayKey } from "../lib/time";
import { urls } from "../lib/urls";
import { applyAiSpamCheck } from "./ai-spam";
import { deliverSubmission, type EmailChannelConfig } from "./deliver";
import { deliverMany } from "./deliver-many";

/**
 * Zero-signup forms: `<form action="https://sendm8.com/f/you@example.com">`.
 * The first real submission creates an unclaimed form and emails the address once to confirm.
 * Nothing is delivered until they confirm; "Not me" disables the form for good.
 * Signing in with that (verified) email claims the form into the account.
 */

export const DECLINED_REASON = "declined_by_recipient";
const CONFIRM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const BACKLOG_LIMIT = 25;

export function newZeroSignupForm(email: string, now: number): FormRow {
  return {
    id: newFormId(),
    userId: null,
    name: `Form for ${email}`,
    status: "pending_confirmation",
    allowedOrigins: [],
    redirectUrl: null,
    settings: {},
    ownerEmail: email,
    turnstileSecretEnc: null,
    flaggedReason: null,
    reviewedAt: null,
    createdAt: now,
  };
}

/** Caps how many new email endpoints one IP can create per day, so it can't be used to spam inboxes. */
export function claimZeroSignupSlot(env: Env, ipHash: string | null, now: number) {
  return claimCounter(env.DB, "zero_signup_ip", ipHash ?? "unknown", dayKey(now), getLimits(env).zeroSignupFormsPerIpPerDay);
}

const unclaimedAddress = (db: Db, email: string) =>
  db
    .select()
    .from(emailAddresses)
    .where(and(isNull(emailAddresses.userId), eq(emailAddresses.email, email)))
    .get();

/** Statements that create the form and its (unverified) recipient, batched with the first submission. */
export async function zeroSignupInserts(db: Db, form: FormRow): Promise<BatchItem[]> {
  const statements = [db.insert(forms).values(form)];
  if (!(await unclaimedAddress(db, form.ownerEmail!))) {
    return [...statements, db.insert(emailAddresses).values({ id: newId(), userId: null, email: form.ownerEmail!, createdAt: form.createdAt })];
  }
  return statements;
}

/** Sends the one-off confirmation email, at most once per 24 hours per address. */
export async function sendOwnerConfirmation(env: Env, form: FormRow, referrer: string | null, now = Date.now()): Promise<boolean> {
  const db = getDb(env);
  const address = await unclaimedAddress(db, form.ownerEmail!);
  if (!address || address.verifiedAt) return false;

  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  // Conditional update: concurrent submissions can't both send a confirmation.
  const reserved = await db
    .update(emailAddresses)
    .set({ tokenHash, tokenSentAt: now })
    .where(and(eq(emailAddresses.id, address.id), or(isNull(emailAddresses.tokenSentAt), lt(emailAddresses.tokenSentAt, now - CONFIRM_COOLDOWN_MS))))
    .returning({ id: emailAddresses.id })
    .get();
  if (!reserved) return false;

  if (!(await claimSystemEmail(env.DB, getLimits(env), "account", null, now))) {
    await db.update(emailAddresses).set({ tokenHash: null, tokenSentAt: null }).where(eq(emailAddresses.id, address.id));
    return false;
  }

  const waiting = await db
    .select({ n: count() })
    .from(submissions)
    .where(and(eq(submissions.formId, form.id), eq(submissions.status, "ok")))
    .get();
  const result = await sendSystemEmail(env, {
    to: [address.email],
    ...zeroSignupConfirmEmail({
      email: address.email,
      site: parseHttpUrl(referrer)?.hostname ?? null,
      waiting: Math.max(waiting?.n ?? 0, 1),
      confirmUrl: urls.confirmForm(env.APP_URL, token),
      formEndpoint: `${env.APP_URL}/f/${form.id}`,
    }),
    idempotencyKey: `confirm:${tokenHash}`,
  });
  return result.ok;
}

/** What happens after an `ok` submission is stored: deliver it, or ask the owner to confirm first. */
export async function dispatchStored(env: Env, form: FormRow, submissionId: string, referrer: string | null) {
  if (form.status === "active") {
    if (form.settings.aiSpamScoring && env.AI) {
      const submission = await getDb(env).select().from(submissions).where(eq(submissions.id, submissionId)).get();
      // Spam caught here is never delivered.
      if (submission && (await applyAiSpamCheck(env, submission))) return;
    }
    if (form.settings.notifyMode !== "off") await deliverSubmission(env, submissionId);
  } else if (form.status === "pending_confirmation" && form.ownerEmail) {
    await sendOwnerConfirmation(env, form, referrer);
  }
}

async function emailChannelStatements(env: Env, db: Db, formIds: string[], address: { id: string; email: string }, replaceAddressId?: string): Promise<BatchItem[]> {
  if (formIds.length === 0) return [];
  const addressId = address.id;
  const existing = await db
    .select()
    .from(channels)
    .where(and(inArray(channels.formId, formIds), eq(channels.type, "email")))
    .all();

  const statements: BatchItem[] = [];
  const covered = new Set<string>();
  for (const channel of existing) {
    const config = await decryptJson<EmailChannelConfig>(env, channel.configEnc);
    if (config.emailAddressId === addressId) covered.add(channel.formId);
    if (replaceAddressId && config.emailAddressId === replaceAddressId) {
      covered.add(channel.formId);
      statements.push(db.update(channels).set({ configEnc: await encryptJson(env, { emailAddressId: addressId }) }).where(eq(channels.id, channel.id)));
    }
  }
  for (const formId of formIds.filter((id) => !covered.has(id))) {
    statements.push(
      db.insert(channels).values({
        id: newId(),
        formId,
        type: "email",
        configEnc: await encryptJson(env, { emailAddressId: addressId } satisfies EmailChannelConfig),
        label: address.email,
        createdAt: Date.now(),
      }),
    );
  }
  return statements;
}

async function runBatch(db: Db, statements: BatchItem[]) {
  if (statements.length) await db.batch(statements as BatchList);
}

/** Delivers submissions that arrived before the owner confirmed. */
export async function deliverBacklog(env: Env, formIds: string[]) {
  if (formIds.length === 0) return;
  const waiting = await getDb(env)
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(inArray(submissions.formId, formIds), eq(submissions.status, "ok"), sql`${submissions.deliveries} = '[]'`))
    .orderBy(asc(submissions.id))
    .limit(BACKLOG_LIMIT)
    .all();
  await deliverMany(
    env,
    waiting.map((w) => w.id),
    { alreadyUsed: 12 },
  );
}

export async function confirmZeroSignup(env: Env, token: string, now = Date.now()) {
  const db = getDb(env);
  const address = await findByToken(db, token, now);
  if (!address || address.userId !== null) return null;

  const pending = await db
    .select({ id: forms.id })
    .from(forms)
    .where(and(isNull(forms.userId), eq(forms.ownerEmail, address.email), eq(forms.status, "pending_confirmation")))
    .all();
  const formIds = pending.map((f) => f.id);

  await runBatch(db, [
    db.update(emailAddresses).set({ verifiedAt: now, tokenHash: null, tokenSentAt: null }).where(eq(emailAddresses.id, address.id)),
    ...(formIds.length ? [db.update(forms).set({ status: "active" }).where(inArray(forms.id, formIds))] : []),
    ...(await emailChannelStatements(env, db, formIds, address)),
  ]);
  return { email: address.email, formIds };
}

export async function declineZeroSignup(env: Env, token: string, now = Date.now()) {
  const db = getDb(env);
  const address = await findByToken(db, token, now);
  if (!address || address.userId !== null) return null;

  const owned = and(isNull(forms.userId), eq(forms.ownerEmail, address.email));
  const formIds = (await db.select({ id: forms.id }).from(forms).where(owned).all()).map((f) => f.id);
  const withFiles = await submissionsWithFiles(db, formIds);
  await runBatch(db, [
    db.update(emailAddresses).set({ tokenHash: null, tokenSentAt: null }).where(eq(emailAddresses.id, address.id)),
    ...(formIds.length
      ? [
          db.update(forms).set({ status: "disabled", flaggedReason: DECLINED_REASON }).where(inArray(forms.id, formIds)),
          db.delete(submissions).where(inArray(submissions.formId, formIds)),
        ]
      : []),
  ]);
  await deleteSubmissionFiles(env, withFiles);
  return { email: address.email, formIds };
}

/**
 * Moves unclaimed forms for the user's verified email into their account. Signing in with that
 * address proves ownership, so pending forms activate and a previous "Not me" is undone.
 * Forms an admin disabled stay disabled.
 */
export async function claimFormsForUser(env: Env, user: SessionUser): Promise<string[]> {
  if (!user.emailVerified) return [];
  const db = getDb(env);
  const email = user.email.toLowerCase();

  const unclaimed = await db
    .select()
    .from(forms)
    .where(and(isNull(forms.userId), eq(forms.ownerEmail, email)))
    .all();
  if (unclaimed.length === 0) return [];

  const now = Date.now();
  const [nullAddress, userAddress] = await Promise.all([
    unclaimedAddress(db, email),
    db
      .select()
      .from(emailAddresses)
      .where(and(eq(emailAddresses.userId, user.id), eq(emailAddresses.email, email)))
      .get(),
  ]);

  const statements: BatchItem[] = [];
  let addressId: string;
  if (userAddress) {
    addressId = userAddress.id;
    if (!userAddress.verifiedAt) statements.push(db.update(emailAddresses).set({ verifiedAt: now }).where(eq(emailAddresses.id, userAddress.id)));
  } else if (nullAddress) {
    addressId = nullAddress.id;
    statements.push(
      db
        .update(emailAddresses)
        .set({ userId: user.id, verifiedAt: nullAddress.verifiedAt ?? now, tokenHash: null, tokenSentAt: null })
        .where(eq(emailAddresses.id, nullAddress.id)),
    );
  } else {
    addressId = newId();
    statements.push(db.insert(emailAddresses).values({ id: addressId, userId: user.id, email, verifiedAt: now, createdAt: now }));
  }

  for (const form of unclaimed) {
    const declined = form.flaggedReason === DECLINED_REASON;
    const reopen = form.status === "pending_confirmation" || (form.status === "disabled" && declined);
    statements.push(
      db
        .update(forms)
        .set({ userId: user.id, status: reopen ? "active" : form.status, flaggedReason: declined ? null : form.flaggedReason })
        .where(eq(forms.id, form.id)),
    );
  }

  const formIds = unclaimed.map((f) => f.id);
  const replace = userAddress && nullAddress ? nullAddress.id : undefined;
  // Channel statements must be built before the old address is deleted.
  statements.push(...(await emailChannelStatements(env, db, formIds, { id: addressId, email }, replace)));
  if (replace) statements.push(db.delete(emailAddresses).where(eq(emailAddresses.id, replace)));

  await runBatch(db, statements);
  return formIds;
}
