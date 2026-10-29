import { and, asc, count, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
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
import { plusVariantsPattern, reachesInboxOf } from "../lib/email-address";
import { parseHttpUrl } from "../lib/http";
import { newFormId, newId } from "../lib/ids";
import { decryptJson, encryptJson, randomToken } from "../lib/secrets";
import { dayKey } from "../lib/time";
import { urls } from "../lib/urls";
import { withQueryBudget } from "../lib/query-budget";
import { AI_CHECK_QUERIES, applyAiSpamCheck } from "./ai-spam";
import { deliverSubmission, type EmailChannelConfig } from "./deliver";
import { deliverMany, QUERIES_PER_DELIVERY } from "./deliver-many";

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
    settings: { aiSpamScoring: true },
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
      if (submission && (await applyAiSpamCheck(env, submission, form.ownerEmail))) return;
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
/**
 * Delivers what arrived while a form waited for confirmation. Those submissions skipped the AI check
 * (it only runs for active forms), so it runs here first and spam is kept back. When the query budget
 * runs short, the rest are delivered unchecked rather than held: losing a real message is worse.
 */
export async function deliverBacklog(env: Env, formIds: string[]) {
  if (formIds.length === 0) return;
  // The confirm request has already spent roughly this many queries.
  const budget = withQueryBudget(env, getLimits(env).queriesPerInvocation, 12);
  const db = getDb(budget.env);
  const [waiting, formRows] = await db.batch([
    db
      .select()
      .from(submissions)
      .where(and(inArray(submissions.formId, formIds), eq(submissions.status, "ok"), sql`${submissions.deliveries} = '[]'`))
      .orderBy(asc(submissions.id))
      .limit(BACKLOG_LIMIT),
    db.select({ id: forms.id, settings: forms.settings, ownerEmail: forms.ownerEmail }).from(forms).where(inArray(forms.id, formIds)),
  ]);

  const scored = new Map(env.AI ? formRows.filter((f) => f.settings.aiSpamScoring).map((f) => [f.id, f.ownerEmail]) : []);
  const deliver: string[] = [];
  for (const submission of waiting) {
    // An AI check costs two queries; keep room to deliver this submission afterwards.
    if (scored.has(submission.formId) && budget.has(AI_CHECK_QUERIES + QUERIES_PER_DELIVERY)) {
      if (await applyAiSpamCheck(budget.env, submission, scored.get(submission.formId))) continue;
    }
    deliver.push(submission.id);
  }
  await deliverMany(env, deliver, { alreadyUsed: budget.used() });
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
 * Moves unclaimed forms into the user's account for every address they've proven they own: the
 * verified email they signed in with, and any address they've verified in Email settings. Forms sent
 * to a `+tag` of those (same inbox) count too. Proving ownership is what confirming would have done,
 * so pending forms activate and a previous "Not me" is undone. Forms an admin disabled stay disabled.
 * Returns the claimed forms, and those that just opened, whose waiting messages need delivering.
 */
export async function claimFormsForUser(env: Env, user: SessionUser): Promise<{ formIds: string[]; reopened: string[] }> {
  const verified = await getDb(env)
    .select({ email: emailAddresses.email })
    .from(emailAddresses)
    .where(and(eq(emailAddresses.userId, user.id), isNotNull(emailAddresses.verifiedAt)))
    .all();
  const owned = [...(user.emailVerified ? [user.email] : []), ...verified.map((a) => a.email)];
  return claimFormsForAddresses(env, user.id, owned);
}

/** The claiming itself, for addresses `userId` is known to own (signed in with, or verified). */
export async function claimFormsForAddresses(env: Env, userId: string, owned: string[]): Promise<{ formIds: string[]; reopened: string[] }> {
  const none = { formIds: [], reopened: [] };
  const emails = [...new Set(owned.map((e) => e.trim().toLowerCase()))];
  if (emails.length === 0) return none;
  const db = getDb(env);

  const matches = emails.flatMap((email) => {
    const variants = plusVariantsPattern(email);
    return [eq(forms.ownerEmail, email), ...(variants ? [sql`${forms.ownerEmail} LIKE ${variants} ESCAPE '!'`] : [])];
  });
  const candidates = await db
    .select()
    .from(forms)
    .where(and(isNull(forms.userId), or(...matches)))
    .all();
  // The LIKE only narrows the query; this decides.
  const unclaimed = candidates.filter((f) => f.ownerEmail && emails.some((email) => reachesInboxOf(f.ownerEmail!, email)));
  if (unclaimed.length === 0) return none;

  const now = Date.now();
  const statements: BatchItem[] = [];
  const reopened: string[] = [];
  const byAddress = new Map<string, FormRow[]>();
  for (const form of unclaimed) byAddress.set(form.ownerEmail!, [...(byAddress.get(form.ownerEmail!) ?? []), form]);

  for (const [address, group] of byAddress) {
    const [nullAddress, userAddress] = await Promise.all([
      unclaimedAddress(db, address),
      db
        .select()
        .from(emailAddresses)
        .where(and(eq(emailAddresses.userId, userId), eq(emailAddresses.email, address)))
        .get(),
    ]);

    let addressId: string;
    if (userAddress) {
      addressId = userAddress.id;
      if (!userAddress.verifiedAt) statements.push(db.update(emailAddresses).set({ verifiedAt: now }).where(eq(emailAddresses.id, userAddress.id)));
    } else if (nullAddress) {
      addressId = nullAddress.id;
      statements.push(
        db
          .update(emailAddresses)
          .set({ userId, verifiedAt: nullAddress.verifiedAt ?? now, tokenHash: null, tokenSentAt: null })
          .where(eq(emailAddresses.id, nullAddress.id)),
      );
    } else {
      addressId = newId();
      statements.push(db.insert(emailAddresses).values({ id: addressId, userId, email: address, verifiedAt: now, createdAt: now }));
    }

    for (const form of group) {
      const declined = form.flaggedReason === DECLINED_REASON;
      const reopen = form.status === "pending_confirmation" || (form.status === "disabled" && declined);
      if (reopen) reopened.push(form.id);
      statements.push(
        db
          .update(forms)
          .set({ userId, status: reopen ? "active" : form.status, flaggedReason: declined ? null : form.flaggedReason })
          .where(eq(forms.id, form.id)),
      );
    }

    const replace = userAddress && nullAddress ? nullAddress.id : undefined;
    // Channel statements must be built before the old address is deleted.
    statements.push(...(await emailChannelStatements(env, db, group.map((f) => f.id), { id: addressId, email: address }, replace)));
    if (replace) statements.push(db.delete(emailAddresses).where(eq(emailAddresses.id, replace)));
  }

  await runBatch(db, statements);
  return { formIds: unclaimed.map((f) => f.id), reopened };
}
