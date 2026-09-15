import { and, asc, eq, inArray, lt, lte, ne } from "drizzle-orm";
import type { SubmissionStatus } from "@sendm8/shared";
import { getLimits } from "./config";
import { getDb } from "./db/client";
import { submissions, usageDaily } from "./db/schema";
import { deleteSubmissionFiles } from "./files/storage";
import { ulidFloor } from "./lib/ids";
import { withQueryBudget, type QueryBudget } from "./lib/query-budget";
import { dayKey } from "./lib/time";
import { checkUsage } from "./lib/usage";
import { deliverSubmission } from "./pipeline/deliver";
import { QUERIES_PER_DELIVERY } from "./pipeline/deliver-many";
import { sendDueDigests } from "./pipeline/digest";

export const RETRY_CRON = "*/5 * * * *";
export const HOURLY_CRON = "0 * * * *";

const RETRY_BATCH = 10;
const CLEANUP_HOUR_UTC = 3;
const USAGE_RETENTION_DAYS = 100;
/** Rows purged per statement; small enough that releasing their files stays within the query budget. */
const PURGE_BATCH = 200;

const budgetFor = (env: Env) => withQueryBudget(env, getLimits(env).queriesPerInvocation);

export async function retryDueDeliveries(env: Env, now: number, budget: QueryBudget = budgetFor(env)) {
  const db = getDb(budget.env);
  const due = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(lte(submissions.retryAt, now))
    .orderBy(asc(submissions.retryAt))
    .limit(RETRY_BATCH)
    .all();

  let delivered = 0;
  for (const { id } of due) {
    // Stop before the invocation's query cap; the rest stay due for the next run.
    if (!budget.has(QUERIES_PER_DELIVERY)) break;
    await deliverSubmission(budget.env, id, now);
    delivered++;
  }
  return delivered;
}

export async function cleanup(env: Env, now: number, budget: QueryBudget = budgetFor(env)) {
  const db = getDb(budget.env);
  const limits = getLimits(env);

  const purge = async (condition: ReturnType<typeof and>) => {
    // One delete, then file deletes and storage releases (one global plus one per owner).
    if (!budget.has(4)) return;
    const stale = db.select({ id: submissions.id }).from(submissions).where(condition).limit(PURGE_BATCH);
    const deleted = await db.delete(submissions).where(inArray(submissions.id, stale)).returning({ meta: submissions.meta });
    await deleteSubmissionFiles(budget.env, deleted);
  };

  const byStatusBefore = (status: SubmissionStatus, before: number) => and(eq(submissions.status, status), lt(submissions.createdAt, before));
  await purge(byStatusBefore("spam", now - limits.spamRetentionDays * 86_400_000));
  // Challenges nobody completed within a day are almost certainly bots.
  await purge(byStatusBefore("pending_challenge", now - 86_400_000));

  if (limits.submissionRetentionDays > 0) {
    // ULIDs sort by time, so an id range uses the primary key instead of scanning created_at.
    const cutoff = ulidFloor(now - limits.submissionRetentionDays * 86_400_000);
    await purge(and(lt(submissions.id, cutoff), ne(submissions.status, "pending_challenge")));
  }

  if (budget.has(1)) await db.delete(usageDaily).where(lt(usageDaily.day, dayKey(now - USAGE_RETENTION_DAYS * 86_400_000)));
}

export async function handleScheduled(controller: ScheduledController, env: Env) {
  const now = controller.scheduledTime;
  const budget = budgetFor(env);
  if (controller.cron === RETRY_CRON) {
    await retryDueDeliveries(env, now, budget);
  } else if (controller.cron === HOURLY_CRON) {
    // Usage first: it's cheap and it's what warns you before limits bite.
    await checkUsage(budget.env, now);
    await sendDueDigests(env, now, budget);
    if (new Date(now).getUTCHours() === CLEANUP_HOUR_UTC) await cleanup(env, now, budget);
  }
}
