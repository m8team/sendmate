import type { AdminUsageDto } from "@sendm8/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { postJson } from "../channels/http";
import { getLimits } from "../config";
import { getDb } from "../db/client";
import { storageUsage, usageDaily } from "../db/schema";
import { claimCounter } from "../email/budget";
import { dayKey } from "./time";

export const LOAD_SHED_SCOPE = "load_shed";

/** Free plan: 100k D1 rows written per day. */
export const D1_DAILY_WRITES = 100_000;
const ALERT_THRESHOLDS = [0.7, 0.9] as const;
const SHED_THRESHOLD = 0.9;

/** Current D1 database size in bytes, from the query metadata D1 returns with every statement. */
export async function databaseSize(env: Pick<Env, "DB">): Promise<number | null> {
  try {
    const result = await env.DB.prepare("SELECT 1").run();
    const size = (result.meta as { size_after?: number }).size_after;
    return typeof size === "number" && size > 0 ? size : null;
  } catch {
    return null;
  }
}

export async function computeUsage(env: Env, now = Date.now()): Promise<AdminUsageDto> {
  const db = getDb(env);
  const limits = getLimits(env);
  const day = dayKey(now);
  const [totals, email, top, storage] = await db.batch([
    db
      .select({ submissions: sql<number>`coalesce(sum(${usageDaily.submissions}), 0)` })
      .from(usageDaily)
      .where(and(eq(usageDaily.scope, "form"), eq(usageDaily.day, day))),
    db
      .select({ emails: usageDaily.emails })
      .from(usageDaily)
      .where(and(eq(usageDaily.scope, "system_email"), eq(usageDaily.scopeId, "all"), eq(usageDaily.day, day))),
    db
      .select({ formId: usageDaily.scopeId, submissions: usageDaily.submissions })
      .from(usageDaily)
      .where(and(eq(usageDaily.scope, "form"), eq(usageDaily.day, day)))
      .orderBy(desc(usageDaily.submissions))
      .limit(10),
    db
      .select({ bytes: storageUsage.bytes })
      .from(storageUsage)
      .where(and(eq(storageUsage.scope, "global"), eq(storageUsage.scopeId, "all"))),
  ]);

  const submissions = Number(totals[0]?.submissions ?? 0);
  const systemEmails = email[0]?.emails ?? 0;
  return {
    day,
    submissions,
    systemEmails,
    systemEmailLimit: limits.systemEmailsPerDay,
    // ~3 rows per submission (insert, usage upsert, delivery update) + ~2 per system email (budget counters).
    estimatedWrites: submissions * 3 + systemEmails * 2,
    topForms: top,
    storageBytes: storage[0]?.bytes ?? 0,
    storageLimitBytes: limits.storageTotalBytes,
    databaseBytes: await databaseSize(env),
    databaseLimitBytes: limits.databaseMaxBytes,
  };
}

/**
 * Hourly: turns on load shedding when D1 writes near the daily limit or the database nears its size cap,
 * and posts an alert (once per metric, threshold and day) to ALERT_WEBHOOK_URL. Works for Discord and Slack.
 */
export async function checkUsage(env: Env, now = Date.now()) {
  const usage = await computeUsage(env, now);
  const metrics = [
    { key: "d1_writes", label: "D1 writes (estimated)", used: usage.estimatedWrites, limit: D1_DAILY_WRITES },
    { key: "system_emails", label: "System emails", used: usage.systemEmails, limit: usage.systemEmailLimit },
    { key: "storage", label: "File storage", used: usage.storageBytes, limit: usage.storageLimitBytes },
    ...(usage.databaseBytes === null ? [] : [{ key: "database_size", label: "Database size", used: usage.databaseBytes, limit: usage.databaseLimitBytes }]),
  ];

  const writesRatio = usage.estimatedWrites / D1_DAILY_WRITES;
  // A full database breaks every write, so shed spam and new endpoints well before that.
  const databaseRatio = usage.databaseBytes === null ? 0 : usage.databaseBytes / usage.databaseLimitBytes;
  const shed = writesRatio >= SHED_THRESHOLD || databaseRatio >= SHED_THRESHOLD;
  if (shed) {
    await getDb(env)
      .insert(usageDaily)
      .values({ scope: LOAD_SHED_SCOPE, scopeId: "all", day: usage.day, emails: 1 })
      .onConflictDoNothing();
  }

  const alerts: string[] = [];
  for (const metric of metrics) {
    const ratio = metric.limit > 0 ? metric.used / metric.limit : 0;
    for (const threshold of ALERT_THRESHOLDS) {
      if (ratio < threshold) continue;
      // claimCounter with limit 1 = "only the first time today".
      if (await claimCounter(env.DB, "alert", `${metric.key}:${threshold}`, usage.day, 1)) {
        alerts.push(`${metric.label} at ${Math.round(ratio * 100)}% of its limit (${metric.used.toLocaleString("en-GB")} / ${metric.limit.toLocaleString("en-GB")}).`);
      }
    }
  }

  if (alerts.length && env.ALERT_WEBHOOK_URL) {
    const text = `⚠️ sendm8 usage (${usage.day})\n${alerts.map((a) => `• ${a}`).join("\n")}${shed ? "\nLoad shedding is on: spam isn't stored and new email endpoints are paused." : ""}${databaseRatio >= ALERT_THRESHOLDS[0] ? "\nDatabase filling up: set submissionRetentionDays in LIMITS_JSON, or move to Workers Paid (10 GB)." : ""}`;
    await postJson(env.ALERT_WEBHOOK_URL, JSON.stringify({ content: text, text }));
  }
  return { usage, alerts, shed };
}
