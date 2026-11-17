import type { Db } from "../db/client";
import { emailSuppressions } from "../db/schema";

/** Which of these addresses we've stopped emailing, lowercased. One query, however many addresses. */
export async function suppressedAmong(db: D1Database, emails: string[]): Promise<Set<string>> {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return new Set();
  const marks = unique.map((_, i) => `?${i + 1}`).join(",");
  const { results } = await db.prepare(`SELECT email FROM email_suppressions WHERE email IN (${marks})`).bind(...unique).all<{ email: string }>();
  return new Set(results.map((r) => r.email));
}

export async function isSuppressed(db: D1Database, email: string): Promise<boolean> {
  return (await suppressedAmong(db, [email])).size > 0;
}

/** Records a hard bounce or complaint. Returns whether the address is newly suppressed. */
export async function suppress(db: Db, email: string, reason: "bounce" | "complaint", detail: string | null, now = Date.now()): Promise<boolean> {
  const row = await db
    .insert(emailSuppressions)
    .values({ email: email.trim().toLowerCase(), reason, detail: detail?.slice(0, 300) ?? null, createdAt: now })
    .onConflictDoNothing()
    .returning({ email: emailSuppressions.email })
    .get();
  return row !== undefined;
}
