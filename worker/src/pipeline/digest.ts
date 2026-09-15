import type { Delivery } from "@sendm8/shared";
import { asc, eq, inArray, lte } from "drizzle-orm";
import { getLimits } from "../config";
import { getDb, type FormRow, type SubmissionRow } from "../db/client";
import { channels, emailAddresses, forms, submissions, userSettings } from "../db/schema";
import { claimSystemEmail } from "../email/budget";
import { byokUsable, sendByokEmail, sendSystemEmail, type OutgoingEmail } from "../email/sender";
import { digestEmail, type DigestGroup } from "../email/templates";
import { decryptJson } from "../lib/secrets";
import { urls } from "../lib/urls";
import { withQueryBudget, type QueryBudget } from "../lib/query-budget";
import { flagByokKey, type EmailChannelConfig } from "./deliver";

const MAX_LISTED_PER_FORM = 20;

interface Item {
  submission: SubmissionRow;
  form: FormRow;
  channelId: string;
}

/**
 * Sends digest emails for submissions whose `digest_at` has passed: one email per recipient
 * address, grouped by form. Runs hourly; anything left over (budget, batch size) goes next run.
 */
export async function sendDueDigests(
  outerEnv: Env,
  now = Date.now(),
  budget: QueryBudget = withQueryBudget(outerEnv, getLimits(outerEnv).queriesPerInvocation),
  batchSize = 200,
): Promise<{ emails: number }> {
  const env = budget.env;
  const db = getDb(env);
  const limits = getLimits(env);
  // Each due row may need one update at the end, so never pick up more rows than the budget can write back.
  if (!budget.has(8)) return { emails: 0 };

  const due = await db
    .select({ submission: submissions, form: forms })
    .from(submissions)
    .innerJoin(forms, eq(forms.id, submissions.formId))
    .where(lte(submissions.digestAt, now))
    .orderBy(asc(submissions.digestAt))
    .limit(Math.min(batchSize, Math.max(1, budget.left() - 8)))
    .all();
  if (due.length === 0) return { emails: 0 };

  const userIds = [...new Set(due.map((d) => d.form.userId).filter((id): id is string => Boolean(id)))];
  const channelIds = [...new Set(due.flatMap((d) => d.submission.deliveries.filter((x) => x.status === "digest").map((x) => x.channelId)))];

  const [channelRows, settingsRows] = await db.batch([
    db.select().from(channels).where(inArray(channels.id, channelIds.length ? channelIds : [""])),
    db.select().from(userSettings).where(inArray(userSettings.userId, userIds.length ? userIds : [""])),
  ]);

  const recipientByChannel = new Map<string, string>();
  for (const channel of channelRows) {
    if (channel.type !== "email") continue;
    recipientByChannel.set(channel.id, (await decryptJson<EmailChannelConfig>(env, channel.configEnc)).emailAddressId);
  }
  // Load recipients by id so unclaimed zero-signup forms (no user) work too.
  const addressIds = [...new Set(recipientByChannel.values())];
  const addressRows = await db.select().from(emailAddresses).where(inArray(emailAddresses.id, addressIds.length ? addressIds : [""])).all();
  const addressById = new Map(addressRows.map((a) => [a.id, a]));
  const settingsByUser = new Map(settingsRows.map((s) => [s.userId, s]));

  // Working copies of each submission's deliveries, updated as digests go out.
  const pending = new Map<string, Delivery[]>(due.map((d) => [d.submission.id, d.submission.deliveries.map((x) => ({ ...x }))]));
  const changed = new Set<string>();
  const setStatus = (submissionId: string, channelId: string, patch: Partial<Delivery>) => {
    const delivery = pending.get(submissionId)?.find((x) => x.channelId === channelId);
    if (!delivery) return;
    Object.assign(delivery, patch, { at: now });
    if (patch.error === undefined) delete delivery.error;
    changed.add(submissionId);
  };

  const groups = new Map<string, Item[]>();
  for (const { submission, form } of due) {
    for (const delivery of submission.deliveries) {
      if (delivery.status !== "digest") continue;
      const address = addressById.get(recipientByChannel.get(delivery.channelId) ?? "");
      if (!address?.verifiedAt || submission.status !== "ok" || !(form.userId || form.ownerEmail)) {
        setStatus(submission.id, delivery.channelId, { status: "skipped", error: address ? "not_deliverable" : "recipient_removed" });
        continue;
      }
      const items = groups.get(address.id) ?? [];
      items.push({ submission, form, channelId: delivery.channelId });
      groups.set(address.id, items);
    }
  }

  let emails = 0;
  let budgetExhausted = false;

  for (const [addressId, items] of groups) {
    // Room for this group's budget claim and send bookkeeping, plus every row update still to write.
    if (!budget.has(4 + changed.size + items.length)) break;
    const address = addressById.get(addressId)!;
    const userId = items[0]!.form.userId;

    const byForm = new Map<string, DigestGroup>();
    for (const { submission, form } of items) {
      const group = byForm.get(form.id) ?? { formName: form.name, total: 0, submissions: [] };
      group.total++;
      if (group.submissions.length < MAX_LISTED_PER_FORM) {
        group.submissions.push({ data: submission.data, submittedAt: submission.createdAt, url: urls.submission(env.APP_URL, form.id, submission.id) });
      }
      byForm.set(form.id, group);
    }

    const message: OutgoingEmail = {
      to: [address.email],
      ...digestEmail({ groups: [...byForm.values()], settingsUrl: urls.emailSettings(env.APP_URL) }),
      idempotencyKey: `digest:${addressId}:${items[0]!.submission.id}:${items.length}`,
    };

    const settings = userId ? settingsByUser.get(userId) : undefined;
    let result;
    if (userId && byokUsable(settings)) {
      result = await sendByokEmail(env, settings, message);
      if (!result.ok && result.keyRejected) {
        await flagByokKey(db, userId, result.error);
        settingsByUser.delete(userId);
        result = undefined;
      }
    }
    if (!result) {
      if (budgetExhausted || !(await claimSystemEmail(env.DB, limits, "digest", userId, now))) {
        budgetExhausted = true;
        continue;
      }
      result = await sendSystemEmail(env, message);
    }

    if (result.ok) {
      emails++;
      for (const item of items) setStatus(item.submission.id, item.channelId, { status: "sent", viaDigest: true, error: undefined });
    } else if (!result.retryable) {
      for (const item of items) setStatus(item.submission.id, item.channelId, { status: "skipped", error: result.error });
    }
  }

  // Only rewrite rows that changed (or no longer have anything waiting): D1 writes are the scarce resource.
  const ordered = [...due].sort((a, b) => Number(changed.has(b.submission.id)) - Number(changed.has(a.submission.id)));
  const updates = ordered.flatMap(({ submission }) => {
    const deliveries = pending.get(submission.id)!;
    const stillWaiting = deliveries.some((d) => d.status === "digest");
    if (!changed.has(submission.id) && stillWaiting) return [];
    return db
      .update(submissions)
      .set({ deliveries, digestAt: stillWaiting ? submission.digestAt : null })
      .where(eq(submissions.id, submission.id));
  });
  // Rows whose digest actually went out were budgeted for above; clearing stale rows can wait for the next run.
  const writable = updates.slice(0, Math.max(changed.size, budget.left() + 4));
  const [first, ...rest] = writable;
  if (first) await db.batch([first, ...rest]);

  return { emails };
}
