import { and, eq, gte, inArray } from "drizzle-orm";
import { getLimits } from "../config";
import { getDb } from "../db/client";
import { usageDaily } from "../db/schema";
import { claimCounter, claimSystemEmail } from "../email/budget";
import { sendSystemEmail } from "../email/sender";
import { spamSummaryEmail, type SpamSummaryForm } from "../email/templates";
import { withQueryBudget, type QueryBudget } from "../lib/query-budget";
import { dayKey } from "../lib/time";
import { urls } from "../lib/urls";
import { SPAM_SCORE } from "./spam";

/**
 * "N messages went to your spam folder": at most once a week per owner, and only when our filters
 * binned something. Runs with the hourly cron, a few owners at a time, so it never crowds out
 * notifications or account emails. A full system-email budget just pushes it to the next hour.
 */

export const SPAM_SUMMARY_SCOPE = "spam_summary";
const WEEK_MS = 7 * 86_400_000;
const PER_RUN = 5;
/** Binned below this score: a close call, worth a second look. */
export const CLOSE_CALL_SCORE = 0.95;
/** One send: the email budget claim and the "sent" marker. */
const QUERIES_PER_SEND = 3;

interface Row {
  formId: string;
  formName: string;
  claimed: number;
  email: string | null;
  spam: number;
  borderline: number;
}

export async function sendSpamSummaries(outerEnv: Env, now = Date.now(), budget: QueryBudget = withQueryBudget(outerEnv, getLimits(outerEnv).queriesPerInvocation)): Promise<number> {
  if (!budget.has(2 + QUERIES_PER_SEND)) return 0;
  const env = budget.env;
  const limits = getLimits(env);

  // Only filter verdicts count: an owner moving something to spam themselves needn't be told about it.
  const { results } = await env.DB.prepare(
    `SELECT f.id AS formId, f.name AS formName, f.user_id IS NOT NULL AS claimed,
            lower(coalesce(u.email, f.owner_email)) AS email,
            count(*) AS spam, sum(s.spam_score < ?3) AS borderline
     FROM submissions s JOIN forms f ON f.id = s.form_id LEFT JOIN user u ON u.id = f.user_id
     WHERE s.status = 'spam' AND s.spam_score >= ?1 AND s.created_at >= ?2
       AND f.status = 'active' AND coalesce(json_extract(f.settings, '$.notifyMode'), 'instant') != 'off'
     GROUP BY f.id`,
  )
    .bind(SPAM_SCORE, now - WEEK_MS, CLOSE_CALL_SCORE)
    .all<Row>();

  const byOwner = new Map<string, { claimed: boolean; forms: SpamSummaryForm[] }>();
  for (const row of results) {
    if (!row.email) continue;
    const owner = byOwner.get(row.email) ?? { claimed: Boolean(row.claimed), forms: [] };
    owner.forms.push({ name: row.formName, spam: row.spam, borderline: row.borderline, url: urls.spamFolder(env.APP_URL, row.formId) });
    byOwner.set(row.email, owner);
  }
  if (byOwner.size === 0) return 0;

  const recent = await getDb(env)
    .select({ email: usageDaily.scopeId })
    .from(usageDaily)
    .where(and(eq(usageDaily.scope, SPAM_SUMMARY_SCOPE), gte(usageDaily.day, dayKey(now - WEEK_MS + 86_400_000)), inArray(usageDaily.scopeId, [...byOwner.keys()])))
    .all();
  const sentThisWeek = new Set(recent.map((r) => r.email));

  let sent = 0;
  for (const [email, owner] of byOwner) {
    if (sent >= PER_RUN || !budget.has(QUERIES_PER_SEND)) break;
    if (sentThisWeek.has(email)) continue;
    // A summary is the lowest priority email there is: when the shared budget is spent, try next hour.
    if (!(await claimSystemEmail(env.DB, limits, "digest", null, now))) break;

    owner.forms.sort((a, b) => b.borderline - a.borderline || b.spam - a.spam);
    const message = spamSummaryEmail({ forms: owner.forms, claimed: owner.claimed, signInUrl: urls.signIn(env.APP_URL), retentionDays: limits.spamRetentionDays });
    const result = await sendSystemEmail(env, { to: [email], ...message, idempotencyKey: `spam-summary:${email}:${dayKey(now)}` });
    if (!result.ok) continue;
    await claimCounter(env.DB, SPAM_SUMMARY_SCOPE, email, dayKey(now), 1);
    sent++;
  }
  return sent;
}
