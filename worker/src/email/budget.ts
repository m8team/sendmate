import type { Limits } from "@sendm8/shared";
import { dayKey } from "../lib/time";

/**
 * The sendm8 system sender has a small shared daily budget (Resend free = 100/day).
 * - account: verification emails. May use the whole budget, so they're effectively reserved.
 * - instant: per-submission notifications. Capped per user, and can't eat into the reserve.
 * - digest: daily digests. Share the non-reserved pool but aren't counted per user.
 * BYOK sends never touch this budget.
 */
export type EmailKind = "account" | "instant" | "digest";

const SYSTEM_SCOPE = "system_email";
const USER_SCOPE = "user_email";

/** Atomically increments a daily counter only if it's below `limit`. Returns whether it was claimed. */
export async function claimCounter(db: D1Database, scope: string, scopeId: string, day: string, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  const row = await db
    .prepare(
      `INSERT INTO usage_daily (scope, scope_id, day, submissions, emails) VALUES (?1, ?2, ?3, 0, 1)
       ON CONFLICT (scope, scope_id, day) DO UPDATE SET emails = emails + 1 WHERE usage_daily.emails < ?4
       RETURNING emails`,
    )
    .bind(scope, scopeId, day, limit)
    .first<{ emails: number }>();
  return row !== null;
}

async function release(db: D1Database, scope: string, scopeId: string, day: string) {
  await db
    .prepare("UPDATE usage_daily SET emails = max(emails - 1, 0) WHERE scope = ?1 AND scope_id = ?2 AND day = ?3")
    .bind(scope, scopeId, day)
    .run();
}

export async function claimSystemEmail(db: D1Database, limits: Limits, kind: EmailKind, userId: string | null, now: number): Promise<boolean> {
  const day = dayKey(now);
  const globalLimit = kind === "account" ? limits.systemEmailsPerDay : limits.systemEmailsPerDay - limits.reservedAccountEmailsPerDay;
  if (!(await claimCounter(db, SYSTEM_SCOPE, "all", day, globalLimit))) return false;

  if (kind === "instant" && userId) {
    if (!(await claimCounter(db, USER_SCOPE, userId, day, limits.instantEmailsPerUserPerDay))) {
      await release(db, SYSTEM_SCOPE, "all", day);
      return false;
    }
  }
  return true;
}

export async function instantEmailsUsedToday(db: D1Database, userId: string, now: number): Promise<number> {
  const row = await db
    .prepare("SELECT emails FROM usage_daily WHERE scope = ?1 AND scope_id = ?2 AND day = ?3")
    .bind(USER_SCOPE, userId, dayKey(now))
    .first<{ emails: number }>();
  return row?.emails ?? 0;
}
