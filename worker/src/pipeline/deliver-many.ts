import { inArray } from "drizzle-orm";
import { getLimits } from "../config";
import { getDb } from "../db/client";
import { submissions } from "../db/schema";
import { withQueryBudget } from "../lib/query-budget";
import { deliverSubmission } from "./deliver";

/** Rough worst case for one delivery: lookup, channel/address/settings batch, budget claims, final update. */
export const QUERIES_PER_DELIVERY = 12;

/**
 * Delivers several submissions from one invocation without breaking D1's per-invocation query cap.
 * Everything is queued for the retry cron first (one statement), then as many as fit are delivered
 * straight away; delivery clears the queue marker, and the cron picks up the rest within minutes.
 */
export async function deliverMany(env: Env, ids: string[], opts: { alreadyUsed?: number; now?: number } = {}): Promise<number> {
  if (ids.length === 0) return 0;
  const now = opts.now ?? Date.now();
  const budget = withQueryBudget(env, getLimits(env).queriesPerInvocation, opts.alreadyUsed ?? 0);

  await getDb(budget.env).update(submissions).set({ retryAt: now }).where(inArray(submissions.id, ids));

  let delivered = 0;
  for (const id of ids) {
    if (!budget.has(QUERIES_PER_DELIVERY)) break;
    await deliverSubmission(budget.env, id, now);
    delivered++;
  }
  return delivered;
}
