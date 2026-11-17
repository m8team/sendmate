import { getLimits } from "../config";
import { claimCounter, claimSystemEmail } from "../email/budget";
import { sendSystemEmail } from "../email/sender";
import { limitWarningEmail } from "../email/templates";
import { parseHttpUrl } from "../lib/http";
import { monthStartKey } from "../lib/time";
import { urls } from "../lib/urls";
import { withQueryBudget, type QueryBudget } from "../lib/query-budget";
import { alertFormNearLimit } from "../ops/events";

const SCOPE = "limit_warning";
const WARN_AT = 0.8;
const PER_RUN = 5;
const QUERIES_PER_WARNING = 5;

interface Row {
  id: string;
  ownerEmail: string;
  used: number;
  referrer: string | null;
}

/**
 * Emails the owner of a no-account form when it passes 80% of the monthly cap, and again when it hits
 * it. A real campaign (a raffle form: 99 entries in two days) reached the cap before its owner had
 * signed in, so people would have been turned away with no warning. At most two emails per form per
 * month, only for confirmed forms, inside the system-email budget, and you get a Discord alert to
 * follow up personally.
 */
export async function sendLimitWarnings(outerEnv: Env, now = Date.now(), budget: QueryBudget = withQueryBudget(outerEnv, getLimits(outerEnv).queriesPerInvocation)): Promise<number> {
  if (!budget.has(1 + QUERIES_PER_WARNING)) return 0;
  const env = budget.env;
  const limits = getLimits(env);
  const cap = limits.submissionsPerUnclaimedFormPerMonth;
  const month = monthStartKey(now);

  const { results } = await env.DB.prepare(
    `SELECT f.id, f.owner_email AS ownerEmail, sum(u.submissions) AS used,
            (SELECT json_extract(s.meta, '$.referrer') FROM submissions s WHERE s.form_id = f.id AND json_extract(s.meta, '$.referrer') IS NOT NULL
              ORDER BY s.id DESC LIMIT 1) AS referrer
     FROM forms f
     JOIN usage_daily u ON u.scope = 'form' AND u.scope_id = f.id AND u.day >= ?1
     WHERE f.user_id IS NULL AND f.status = 'active' AND f.owner_email IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM email_suppressions z WHERE z.email = lower(f.owner_email))
     GROUP BY f.id
     HAVING sum(u.submissions) >= ?2
     ORDER BY sum(u.submissions) DESC
     LIMIT 25`,
  )
    .bind(month, Math.ceil(cap * WARN_AT))
    .all<Row>();

  let sent = 0;
  for (const row of results) {
    if (sent >= PER_RUN || !budget.has(QUERIES_PER_WARNING)) break;
    const level = row.used >= cap ? 100 : 80;
    // One row per form, level and month. Checked first, recorded after a successful send.
    const done = await env.DB.prepare("SELECT 1 FROM usage_daily WHERE scope = ?1 AND scope_id = ?2 AND day = ?3")
      .bind(SCOPE, `${row.id}:${level}`, month)
      .first();
    if (done) continue;
    // Lowest priority, like the spam summary: when the shared budget is spent, try next hour.
    if (!(await claimSystemEmail(env.DB, limits, "digest", null, now))) break;

    const site = parseHttpUrl(row.referrer)?.hostname ?? null;
    const result = await sendSystemEmail(env, {
      to: [row.ownerEmail],
      ...limitWarningEmail({
        email: row.ownerEmail,
        site,
        used: row.used,
        limit: cap,
        level,
        accountLimit: limits.submissionsPerFormPerMonth,
        instantPerDay: limits.instantEmailsPerUserPerDay,
        digestHourUtc: limits.digestHourUtc,
        signInUrl: urls.signIn(env.APP_URL),
      }),
      idempotencyKey: `limit-warning:${row.id}:${level}:${month}`,
    });
    if (!result.ok) continue;
    await claimCounter(env.DB, SCOPE, `${row.id}:${level}`, month, 1);
    alertFormNearLimit(env, { id: row.id, ownerEmail: row.ownerEmail }, { used: row.used, limit: cap, level, site });
    sent++;
  }
  return sent;
}
